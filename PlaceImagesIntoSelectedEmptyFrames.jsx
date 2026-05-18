/**
 * PlaceImagesIntoSelectedEmptyFrames.jsx
 *
 * 将图片按文件名顺序置入当前选中的空图片框。
 * - 运行前先选中若干空图片框（Rectangle / Oval / Polygon）
 * - 脚本会要求输入基础标签
 * - 选中的框会按阅读顺序排序，并命名为：基础标签_序号
 * - 选择图片文件夹后，可指定从排序后的第几张图片开始置入
 * - 改名、打标签、置入图片会被包装为一次撤销操作
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

        if (app.selection.length === 0) {
            alert("请先选中一个或多个空图片框，然后再运行脚本。");
            return;
        }

        var selectedFrames = collectSelectedEmptyFrames(app.selection);
        if (selectedFrames.length === 0) {
            alert(
                "当前选区里没有找到可置入图片的空框架。\n\n" +
                    "请选中空的 Rectangle / Oval / Polygon 图片框；已含图片、文本框、锁定对象或锁定图层上的对象会被忽略。"
            );
            return;
        }

        var sortedFrames = sortFramesByReadingOrder(selectedFrames, doc, ROW_TOLERANCE);

        var baseLabel = prompt(
            "请输入要添加到这些框架上的基础标签：\n\n" +
                "脚本会按阅读顺序把序号追加到标签结尾，并同时写入框架名称。\n" +
                "例如输入 image，会生成 image_1、image_2、image_3 ...",
            "image"
        );
        if (baseLabel === null) return;
        baseLabel = trim(baseLabel);
        if (baseLabel === "") {
            alert("标签不能为空。");
            return;
        }

        var folder = Folder.selectDialog("请选择存放图片的文件夹");
        if (folder === null) return;

        var imageFiles = getImageFiles(folder, SUPPORTED_EXTENSIONS);
        if (imageFiles.length === 0) {
            alert("所选文件夹内没有找到支持的图片文件。");
            return;
        }

        imageFiles.sort(function (a, b) {
            return naturalCompare(a.name, b.name);
        });

        var options = askPlaceOptions(sortedFrames.length, imageFiles);
        if (options === null) return;

        var startImageIndex = options.startImageIndex;
        var fitMode = options.fitMode;
        var availableImages = imageFiles.length - startImageIndex;
        var placeCount = Math.min(sortedFrames.length, availableImages);
        var noImageFrameCount = sortedFrames.length - placeCount;

        var confirmMsg =
            "选中空框架: " +
            sortedFrames.length +
            " 个\n" +
            "图片文件: " +
            imageFiles.length +
            " 张\n" +
            "起始图片: 第 " +
            (startImageIndex + 1) +
            " 张 - " +
            imageFiles[startImageIndex].name +
            "\n" +
            "将置入: " +
            placeCount +
            " 张\n";

        if (noImageFrameCount > 0) {
            confirmMsg +=
                "没有对应图片、只会命名打标签的框架: " +
                noImageFrameCount +
                " 个\n";
        }

        confirmMsg +=
            "\n框架标签/名称将写为: " +
            baseLabel +
            "_1 ... " +
            baseLabel +
            "_" +
            sortedFrames.length +
            "\n\n是否继续？";

        if (!confirm(confirmMsg)) return;

        var successCount = 0;
        var failedList = [];

        app.doScript(
            function () {
                var oldRedraw = app.scriptPreferences.enableRedraw;
                app.scriptPreferences.enableRedraw = false;
                try {
                    for (var i = 0; i < sortedFrames.length; i++) {
                        var frame = sortedFrames[i];
                        var frameTag = baseLabel + "_" + (i + 1);

                        try {
                            frame.label = frameTag;
                        } catch (labelErr) {
                            failedList.push(frameTag + " 设置标签失败: " + labelErr.message);
                        }

                        try {
                            frame.name = frameTag;
                        } catch (nameErr) {
                            failedList.push(frameTag + " 设置名称失败: " + nameErr.message);
                        }

                        if (i >= placeCount) continue;

                        var imgFile = imageFiles[startImageIndex + i];
                        try {
                            frame.place(imgFile);
                            if (frame.graphics.length > 0) {
                                frame.fit(fitMode);
                                if (fitMode === FitOptions.FILL_PROPORTIONALLY) {
                                    frame.fit(FitOptions.CENTER_CONTENT);
                                }
                            }
                            successCount++;
                        } catch (placeErr) {
                            failedList.push(imgFile.name + " 置入失败: " + placeErr.message);
                        }
                    }
                } finally {
                    app.scriptPreferences.enableRedraw = oldRedraw;
                }
            },
            ScriptLanguage.JAVASCRIPT,
            undefined,
            UndoModes.ENTIRE_SCRIPT,
            "置入图片到选中空框架"
        );

        var report = "完成。\n\n";
        report += "已处理框架: " + sortedFrames.length + " 个\n";
        report += "成功置入图片: " + successCount + " 张\n";
        if (noImageFrameCount > 0) {
            report += "只命名打标签、未置入图片: " + noImageFrameCount + " 个\n";
        }
        if (failedList.length > 0) {
            report += "\n失败/警告: " + failedList.length + " 项\n";
            var showCount = Math.min(failedList.length, 20);
            for (var q = 0; q < showCount; q++) {
                report += "- " + failedList[q] + "\n";
            }
            if (failedList.length > 20) {
                report += "... 还有 " + (failedList.length - 20) + " 项未显示\n";
            }
        }
        report += "\n需要撤销时，按一次 Cmd+Z 即可撤销本次全部操作。";
        alert(report);
    }

    function collectSelectedEmptyFrames(selection) {
        var frames = [];
        var seen = {};

        for (var i = 0; i < selection.length; i++) {
            collectEmptyFramesFromItem(selection[i], frames, seen);
        }

        return frames;
    }

    function collectEmptyFramesFromItem(item, frames, seen) {
        if (!item) return;

        if (isEmptyGraphicFrame(item)) {
            addFrameOnce(item, frames, seen);
            return;
        }

        try {
            if (item.pageItems && item.pageItems.length > 0) {
                for (var p = 0; p < item.pageItems.length; p++) {
                    collectEmptyFramesFromItem(item.pageItems[p], frames, seen);
                }
            }
        } catch (e1) {}

        try {
            if (item.allPageItems && item.allPageItems.length > 0) {
                for (var a = 0; a < item.allPageItems.length; a++) {
                    collectEmptyFramesFromItem(item.allPageItems[a], frames, seen);
                }
            }
        } catch (e2) {}
    }

    function addFrameOnce(frame, frames, seen) {
        var key = getItemKey(frame);
        if (key !== null) {
            if (seen[key]) return;
            seen[key] = true;
        }
        frames.push(frame);
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

    function isEmptyGraphicFrame(item) {
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
            if (item.graphics.length > 0) return false;
        } catch (e1) {
            return false;
        }

        try {
            if (item.contentType === ContentType.TEXT_TYPE) return false;
        } catch (e2) {}

        try {
            if (item.parentStory && item.parentStory.characters.length > 0) return false;
        } catch (e3) {}

        try {
            if (item.locked) return false;
            if (item.itemLayer.locked || !item.itemLayer.visible) return false;
        } catch (e4) {}

        try {
            if (!item.parentPage) return false;
        } catch (e5) {
            return false;
        }

        return true;
    }

    function sortFramesByReadingOrder(frames, doc, rowTolerance) {
        var records = [];

        for (var i = 0; i < frames.length; i++) {
            var b = frames[i].geometricBounds;
            records.push({
                item: frames[i],
                pageIndex: getPageIndex(frames[i], doc),
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

            var nameLower = f.name.toLowerCase();
            for (var j = 0; j < supportedExtensions.length; j++) {
                var ext = supportedExtensions[j];
                if (nameLower.lastIndexOf(ext) === nameLower.length - ext.length) {
                    imageFiles.push(f);
                    break;
                }
            }
        }

        return imageFiles;
    }

    function askPlaceOptions(frameCount, imageFiles) {
        var dlg = new Window("dialog", "置入图片设置");
        dlg.orientation = "column";
        dlg.alignChildren = "fill";

        var infoPanel = dlg.add("panel", undefined, "图片顺序");
        infoPanel.orientation = "column";
        infoPanel.alignChildren = "left";
        infoPanel.margins = 12;

        var preview = "选中框架: " + frameCount + " 个\n";
        preview += "图片文件: " + imageFiles.length + " 张\n\n";
        preview += buildImagePreview(imageFiles);
        var previewText = infoPanel.add("statictext", undefined, preview, { multiline: true });
        previewText.characters = 70;

        var startGroup = dlg.add("group");
        startGroup.orientation = "row";
        startGroup.alignChildren = "center";
        startGroup.add("statictext", undefined, "从排序后的第几张图片开始置入:");
        var startInput = startGroup.add("edittext", undefined, "1");
        startInput.characters = 8;

        var fitPanel = dlg.add("panel", undefined, "适配方式");
        fitPanel.orientation = "column";
        fitPanel.alignChildren = "left";
        fitPanel.margins = 12;
        var fitFill = fitPanel.add("radiobutton", undefined, "按比例填充框（可能裁切边缘）");
        var fitProp = fitPanel.add("radiobutton", undefined, "按比例适合（完整显示，可能留白）");
        fitFill.value = true;

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
            fitMode: fitFill.value ? FitOptions.FILL_PROPORTIONALLY : FitOptions.PROPORTIONALLY
        };
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
