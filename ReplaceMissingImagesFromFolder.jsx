/**
 * ReplaceMissingImagesFromFolder.jsx
 *
 * 自动检测当前文档中链接缺失的图片框，并按文件夹图片顺序一一替换。
 * - 缺失图片框按文档页面阅读顺序排序
 * - 文件夹图片按自然文件名顺序排序
 * - 实际替换使用 frame.place()，绕开缺失链接的逐个更新
 * - 全部替换会被包装为一次撤销操作
 */

(function () {
    try {
        main();
    } catch (err) {
        var msg = "脚本执行失败。";
        if (err && err.message) msg += "\n\n" + err.message;
        if (err && err.line) msg += "\n行号: " + err.line;
        alert(msg);
    }

    function main() {
        var SUPPORTED_EXTENSIONS = [
            ".jpg",
            ".jpeg",
            ".png",
            ".tif",
            ".tiff",
            ".psd",
            ".pdf",
            ".ai",
            ".eps",
            ".gif"
        ];
        var ROW_TOLERANCE = 5;

        if (app.documents.length === 0) {
            alert("请先打开一个 InDesign 文档。");
            return;
        }

        var doc = app.activeDocument;
        var scanResult = collectMissingImageLinks(doc);
        if (scanResult.items.length === 0) {
            var noMissingMsg = "当前文档没有找到可处理的缺失图片链接。";
            if (scanResult.issues.length > 0) {
                noMissingMsg += buildIssuePreview("\n\n已跳过的缺失链接:", scanResult.issues, 12);
            }
            alert(noMissingMsg);
            return;
        }

        var missingItems = sortMissingItemsByReadingOrder(scanResult.items, doc, ROW_TOLERANCE);

        var folder = Folder.selectDialog("请选择用于替换缺失图片的文件夹");
        if (folder === null) return;

        var imageFiles = getImageFiles(folder, SUPPORTED_EXTENSIONS);
        if (imageFiles.length === 0) {
            alert("所选文件夹内没有找到支持的图片文件。");
            return;
        }

        imageFiles.sort(function (a, b) {
            return naturalCompare(a.name, b.name);
        });

        var options = askReplaceOptions(missingItems, imageFiles);
        if (options === null) return;

        var startImageIndex = options.startImageIndex;
        var fitMode = options.fitMode;
        var shouldFit = options.shouldFit;
        var availableImages = imageFiles.length - startImageIndex;
        var replaceCount = Math.min(missingItems.length, availableImages);
        var noImageCount = missingItems.length - replaceCount;
        var unusedImageCount = availableImages - replaceCount;

        var confirmMsg =
            "检测到缺失图片框: " +
            missingItems.length +
            " 个\n" +
            "文件夹图片: " +
            imageFiles.length +
            " 张\n" +
            "起始图片: 第 " +
            (startImageIndex + 1) +
            " 张 - " +
            imageFiles[startImageIndex].name +
            "\n" +
            "将替换: " +
            replaceCount +
            " 个\n";

        if (noImageCount > 0) {
            confirmMsg += "没有对应图片、将保持缺失: " + noImageCount + " 个\n";
        }
        if (unusedImageCount > 0) {
            confirmMsg += "未使用的剩余图片: " + unusedImageCount + " 张\n";
        }
        if (scanResult.issues.length > 0) {
            confirmMsg += "已跳过的缺失链接: " + scanResult.issues.length + " 个\n";
        }
        confirmMsg += "\n" + buildReplacementPreview(missingItems, imageFiles, startImageIndex, replaceCount, 10);
        if (scanResult.issues.length > 0) {
            confirmMsg += buildIssuePreview("\n\n跳过明细:", scanResult.issues, 8);
        }
        confirmMsg += "\n\n是否继续替换？";

        if (!confirm(confirmMsg)) return;

        var successCount = 0;
        var failedList = [];

        app.doScript(
            function () {
                var oldRedraw = app.scriptPreferences.enableRedraw;
                var oldUserInteraction = app.scriptPreferences.userInteractionLevel;
                app.scriptPreferences.enableRedraw = false;
                app.scriptPreferences.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;
                try {
                    for (var i = 0; i < replaceCount; i++) {
                        var item = missingItems[i];
                        var imgFile = imageFiles[startImageIndex + i];
                        try {
                            clearFrameGraphics(item.frame);
                            item.frame.place(imgFile);
                            if (shouldFit) {
                                applyFit(item.frame, fitMode);
                            }

                            successCount++;
                        } catch (replaceErr) {
                            failedList.push(
                                item.oldName + " -> " + imgFile.name + " 替换失败: " + replaceErr.message
                            );
                        }
                    }
                } finally {
                    app.scriptPreferences.userInteractionLevel = oldUserInteraction;
                    app.scriptPreferences.enableRedraw = oldRedraw;
                }
            },
            ScriptLanguage.JAVASCRIPT,
            undefined,
            UndoModes.ENTIRE_SCRIPT,
            "替换缺失图片链接"
        );

        var report = "完成。\n\n";
        report += "检测到缺失图片框: " + missingItems.length + " 个\n";
        report += "成功替换: " + successCount + " 个\n";
        if (noImageCount > 0) {
            report += "仍保持缺失、因为没有对应图片: " + noImageCount + " 个\n";
        }
        if (scanResult.issues.length > 0) {
            report += "扫描时跳过: " + scanResult.issues.length + " 个\n";
        }
        if (failedList.length > 0) {
            report += "\n失败: " + failedList.length + " 项\n";
            report += listPreview(failedList, 20);
        }
        if (scanResult.issues.length > 0) {
            report += buildIssuePreview("\n\n跳过明细:", scanResult.issues, 20);
        }
        report += "\n\n需要撤销时，按一次 Cmd+Z 即可撤销本次全部替换。";
        alert(report);
    }

    function collectMissingImageLinks(doc) {
        var result = {
            items: [],
            issues: []
        };
        var seenFrames = {};

        for (var i = 0; i < doc.links.length; i++) {
            var link = doc.links[i];
            if (!isMissingLink(link)) continue;

            var oldName = safeLinkName(link);
            var graphic = null;
            try {
                graphic = link.parent;
            } catch (parentErr) {}

            var frame = getGraphicFrame(graphic);
            if (!frame) {
                result.issues.push(oldName + " - 无法找到所属图片框");
                continue;
            }

            if (!isProcessableGraphicFrame(frame)) {
                result.issues.push(oldName + " - 所属框架不是可处理的页面图片框，或对象/图层已锁定、隐藏");
                continue;
            }

            var key = getItemKey(frame);
            if (key !== null) {
                if (seenFrames[key]) {
                    result.issues.push(oldName + " - 同一个图片框已记录过，跳过重复链接");
                    continue;
                }
                seenFrames[key] = true;
            }

            result.items.push({
                link: link,
                frame: frame,
                graphic: graphic,
                oldName: oldName
            });
        }

        return result;
    }

    function isMissingLink(link) {
        var status = null;
        try {
            status = link.status;
        } catch (e1) {
            return false;
        }

        try {
            if (status === LinkStatus.LINK_MISSING) return true;
        } catch (e2) {}

        try {
            return String(status).indexOf("LINK_MISSING") >= 0;
        } catch (e3) {}

        return false;
    }

    function safeLinkName(link) {
        try {
            var name = trim(link.name);
            if (name !== "") return name;
        } catch (e1) {}
        return "未命名链接";
    }

    function getGraphicFrame(graphic) {
        if (!graphic) return null;
        try {
            return graphic.parent;
        } catch (e1) {}
        return null;
    }

    function isProcessableGraphicFrame(item) {
        if (!item) return false;

        var typeName = "";
        try {
            typeName = item.constructor.name;
        } catch (e0) {
            return false;
        }

        if (typeName !== "Rectangle" && typeName !== "Oval" && typeName !== "Polygon") {
            return false;
        }

        try {
            if (item.contentType === ContentType.TEXT_TYPE) return false;
        } catch (e1) {}

        try {
            if (item.locked) return false;
            if (item.itemLayer.locked || !item.itemLayer.visible) return false;
        } catch (e2) {}

        try {
            if (!item.parentPage) return false;
        } catch (e3) {
            return false;
        }

        return true;
    }

    function sortMissingItemsByReadingOrder(items, doc, rowTolerance) {
        var records = [];

        for (var i = 0; i < items.length; i++) {
            var b = items[i].frame.geometricBounds;
            records.push({
                item: items[i],
                pageIndex: getPageIndex(items[i].frame, doc),
                top: b[0],
                left: b[1],
                cy: (b[0] + b[2]) / 2,
                cx: (b[1] + b[3]) / 2
            });
        }

        records.sort(function (a, b) {
            if (a.pageIndex !== b.pageIndex) return a.pageIndex - b.pageIndex;
            if (a.cy !== b.cy) return a.cy - b.cy;
            return a.cx - b.cx;
        });

        var sorted = [];
        var pageRows = [];
        var currentPage = null;
        var currentRow = [];
        var currentRowY = 0;

        function flushRow() {
            if (currentRow.length === 0) return;
            currentRow.sort(function (a, b) {
                return a.cx - b.cx;
            });
            pageRows.push(currentRow);
            currentRow = [];
        }

        function flushPage() {
            flushRow();
            for (var r = 0; r < pageRows.length; r++) {
                for (var c = 0; c < pageRows[r].length; c++) {
                    sorted.push(pageRows[r][c].item);
                }
            }
            pageRows = [];
        }

        for (var n = 0; n < records.length; n++) {
            var rec = records[n];

            if (currentPage === null || rec.pageIndex !== currentPage) {
                if (currentPage !== null) flushPage();
                currentPage = rec.pageIndex;
                currentRow = [rec];
                currentRowY = rec.cy;
                continue;
            }

            if (Math.abs(rec.cy - currentRowY) <= rowTolerance) {
                currentRow.push(rec);
                currentRowY = (currentRowY * (currentRow.length - 1) + rec.cy) / currentRow.length;
            } else {
                flushRow();
                currentRow = [rec];
                currentRowY = rec.cy;
            }
        }

        flushPage();
        return sorted;
    }

    function getPageIndex(item, doc) {
        try {
            if (item.parentPage && item.parentPage.documentOffset !== undefined) {
                return item.parentPage.documentOffset;
            }
        } catch (e1) {}

        try {
            for (var i = 0; i < doc.pages.length; i++) {
                if (item.parentPage === doc.pages[i]) return i;
            }
        } catch (e2) {}

        return 999999;
    }

    function getImageFiles(folder, supportedExtensions) {
        var allFiles = folder.getFiles();
        var imageFiles = [];

        for (var i = 0; i < allFiles.length; i++) {
            var f = allFiles[i];
            if (!(f instanceof File)) continue;
            if (isSupportedImageFile(f, supportedExtensions)) {
                imageFiles.push(f);
            }
        }

        return imageFiles;
    }

    function isSupportedImageFile(file, supportedExtensions) {
        var nameLower = file.name.toLowerCase();
        for (var i = 0; i < supportedExtensions.length; i++) {
            var ext = supportedExtensions[i];
            if (nameLower.lastIndexOf(ext) === nameLower.length - ext.length) {
                return true;
            }
        }
        return false;
    }

    function askReplaceOptions(missingItems, imageFiles) {
        var dlg = new Window("dialog", "替换缺失图片设置");
        dlg.orientation = "column";
        dlg.alignChildren = "fill";

        var infoPanel = dlg.add("panel", undefined, "检测结果与图片顺序");
        infoPanel.orientation = "column";
        infoPanel.alignChildren = "left";
        infoPanel.margins = 12;

        var preview = "缺失图片框: " + missingItems.length + " 个\n";
        preview += "图片文件: " + imageFiles.length + " 张\n\n";
        preview += "文件夹图片顺序:\n" + buildImagePreview(imageFiles);
        var previewText = infoPanel.add("statictext", undefined, preview, { multiline: true });
        previewText.characters = 72;

        var startGroup = dlg.add("group");
        startGroup.orientation = "row";
        startGroup.alignChildren = "center";
        startGroup.add("statictext", undefined, "从排序后的第几张图片开始替换:");
        var startInput = startGroup.add("edittext", undefined, "1");
        startInput.characters = 8;

        var fitPanel = dlg.add("panel", undefined, "替换后的适配方式");
        fitPanel.orientation = "column";
        fitPanel.alignChildren = "left";
        fitPanel.margins = 12;
        var fitKeep = fitPanel.add("radiobutton", undefined, "直接置入，不额外适配");
        var fitFill = fitPanel.add("radiobutton", undefined, "按比例填充框（可能裁切边缘）");
        var fitProp = fitPanel.add("radiobutton", undefined, "按比例适合（完整显示，可能留白）");
        fitKeep.value = true;

        var btnGroup = dlg.add("group");
        btnGroup.alignment = "right";
        btnGroup.add("button", undefined, "执行", { name: "ok" });
        btnGroup.add("button", undefined, "取消", { name: "cancel" });

        if (dlg.show() !== 1) return null;

        var startNumber = parseInt(startInput.text, 10);
        if (isNaN(startNumber) || startNumber < 1 || startNumber > imageFiles.length) {
            alert("起始图片序号无效。请输入 1 到 " + imageFiles.length + " 之间的数字。");
            return null;
        }

        return {
            startImageIndex: startNumber - 1,
            shouldFit: !fitKeep.value,
            fitMode: fitFill.value ? FitOptions.FILL_PROPORTIONALLY : FitOptions.PROPORTIONALLY
        };
    }

    function applyFit(frame, fitMode) {
        try {
            if (frame.graphics.length > 0) {
                frame.fit(fitMode);
                if (fitMode === FitOptions.FILL_PROPORTIONALLY) {
                    frame.fit(FitOptions.CENTER_CONTENT);
                }
            }
        } catch (fitErr) {}
    }

    function clearFrameGraphics(frame) {
        try {
            for (var i = frame.graphics.length - 1; i >= 0; i--) {
                try {
                    frame.graphics[i].remove();
                } catch (removeErr) {}
            }
        } catch (e1) {}
    }

    function buildImagePreview(imageFiles) {
        var lines = [];
        var total = imageFiles.length;
        var showHead = Math.min(total, 8);

        for (var i = 0; i < showHead; i++) {
            lines.push((i + 1) + ". " + imageFiles[i].name);
        }

        if (total > 12) {
            lines.push("...");
            for (var j = total - 3; j < total; j++) {
                lines.push((j + 1) + ". " + imageFiles[j].name);
            }
        } else {
            for (var k = showHead; k < total; k++) {
                lines.push((k + 1) + ". " + imageFiles[k].name);
            }
        }

        return lines.join("\n");
    }

    function buildReplacementPreview(missingItems, imageFiles, startImageIndex, replaceCount, maxCount) {
        var lines = ["替换预览:"];
        var count = Math.min(replaceCount, maxCount);
        for (var i = 0; i < count; i++) {
            var item = missingItems[i];
            var imgFile = imageFiles[startImageIndex + i];
            lines.push(
                "- " +
                    pageDisplayName(item.frame) +
                    " / " +
                    item.oldName +
                    " -> " +
                    imgFile.name
            );
        }
        if (replaceCount > maxCount) {
            lines.push("... 还有 " + (replaceCount - maxCount) + " 个未显示");
        }
        return lines.join("\n");
    }

    function pageDisplayName(frame) {
        try {
            if (frame.parentPage && frame.parentPage.name !== undefined) {
                return "第 " + frame.parentPage.name + " 页";
            }
        } catch (e1) {}
        return "未知页面";
    }

    function buildIssuePreview(title, issues, maxCount) {
        if (issues.length === 0) return "";
        var lines = [title];
        var count = Math.min(issues.length, maxCount);
        for (var i = 0; i < count; i++) {
            lines.push("- " + issues[i]);
        }
        if (issues.length > maxCount) {
            lines.push("... 还有 " + (issues.length - maxCount) + " 项未显示");
        }
        return lines.join("\n");
    }

    function listPreview(items, maxCount) {
        var lines = [];
        var count = Math.min(items.length, maxCount);
        for (var i = 0; i < count; i++) {
            lines.push("- " + items[i]);
        }
        if (items.length > maxCount) {
            lines.push("... 还有 " + (items.length - maxCount) + " 项未显示");
        }
        return lines.join("\n");
    }

    function getItemKey(item) {
        try {
            if (item.id !== undefined && item.id !== null) {
                return "id:" + item.id;
            }
        } catch (e1) {}
        try {
            return "spec:" + item.toSpecifier();
        } catch (e2) {}
        return null;
    }

    function naturalCompare(a, b) {
        var aa = splitNatural(a);
        var bb = splitNatural(b);
        var len = Math.min(aa.length, bb.length);

        for (var i = 0; i < len; i++) {
            var ca = aa[i];
            var cb = bb[i];
            var na = /^\d+$/.test(ca);
            var nb = /^\d+$/.test(cb);

            if (na && nb) {
                var ia = parseInt(ca, 10);
                var ib = parseInt(cb, 10);
                if (ia !== ib) return ia - ib;
                if (ca.length !== cb.length) return ca.length - cb.length;
            } else if (ca !== cb) {
                return ca < cb ? -1 : 1;
            }
        }

        return aa.length - bb.length;
    }

    function splitNatural(value) {
        var parts = String(value).toLowerCase().match(/\d+|\D+/g);
        if (parts && parts.length > 0) return parts;
        return [String(value).toLowerCase()];
    }

    function trim(value) {
        return String(value).replace(/^\s+|\s+$/g, "");
    }
})();
