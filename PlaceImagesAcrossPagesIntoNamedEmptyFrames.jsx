/**
 * PlaceImagesAcrossPagesIntoNamedEmptyFrames.jsx
 *
 * 跨页面按空框名称灌入图片。
 * - 运行前只需选中起始页面上的一个空图片框（Rectangle / Oval / Polygon）
 * - 脚本会从该页面开始，逐页识别所有空图片框
 * - 每页内的空框按图层面板中的对象名称排序；名称必须包含数字结构
 * - 多选图片后，图片会按文件名自然排序，再依次匹配空框
 * - 置入前会展示每页框架数量和每个框架对应的图片，确认后才执行
 * - 全部置入会被包装成一次撤销操作
 */

(function () {
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

    try {
        main();
    } catch (err) {
        var msg = "脚本执行失败。";
        if (err && err.message) msg += "\n\n" + err.message;
        if (err && err.line) msg += "\n行号: " + err.line;
        alert(msg);
    }

    function main() {
        if (app.documents.length === 0) {
            alert("请先打开一个 InDesign 文档。");
            return;
        }

        var doc = app.activeDocument;
        var startFrame = getSingleSelectedEmptyFrame(app.selection);
        if (!startFrame) return;

        var startPage = null;
        try {
            startPage = startFrame.parentPage;
        } catch (e1) {}

        if (!startPage || !startPage.isValid) {
            alert("选中的空框架不在普通文档页面上。请不要选择主页、粘贴板或嵌入对象里的框架。");
            return;
        }

        var imageFiles = chooseImageFiles();
        if (imageFiles === null) return;
        if (imageFiles.length === 0) {
            alert("没有选择任何可置入的图片文件。");
            return;
        }

        imageFiles.sort(function (a, b) {
            return naturalCompare(a.name, b.name);
        });

        var planResult = buildPlacementPlan(doc, startPage, imageFiles);
        if (!planResult.ok) {
            alert(planResult.message);
            return;
        }

        var options = askConfirmPlan(planResult.plan, imageFiles);
        if (options === null) return;

        var result = {
            success: 0,
            failed: []
        };

        app.doScript(
            function () {
                var oldRedraw = app.scriptPreferences.enableRedraw;
                app.scriptPreferences.enableRedraw = false;

                try {
                    placeByPlan(planResult.plan, options.fitMode, result);
                } finally {
                    app.scriptPreferences.enableRedraw = oldRedraw;
                }
            },
            ScriptLanguage.JAVASCRIPT,
            undefined,
            UndoModes.ENTIRE_SCRIPT,
            "跨页面灌入图片到命名空框架"
        );

        alert(buildFinalReport(planResult.plan, result));
    }

    function getSingleSelectedEmptyFrame(selection) {
        if (!selection || selection.length === 0) {
            alert("请先选中起始页面上的一个空图片框，然后再运行脚本。");
            return null;
        }

        if (selection.length !== 1) {
            alert("请只选中一个空图片框作为起始页面定位。");
            return null;
        }

        var frame = normalizeToGraphicFrame(selection[0]);
        if (!isEmptyGraphicFrame(frame)) {
            alert(
                "当前选中的对象不是可用的空图片框。\n\n" +
                    "请选中一个空的 Rectangle / Oval / Polygon；已含图片、文本框、锁定对象或锁定图层上的对象不能作为起点。"
            );
            return null;
        }

        return frame;
    }

    function normalizeToGraphicFrame(item) {
        if (isGraphicFrameType(item)) return item;

        try {
            if (item.parent && isGraphicFrameType(item.parent)) return item.parent;
        } catch (e1) {}

        return null;
    }

    function chooseImageFiles() {
        var selected = File.openDialog(
            "请选择要置入的图片文件（可多选；脚本会按文件名自然排序）",
            function (f) {
                if (f instanceof Folder) return true;
                return isSupportedImageFile(f);
            },
            true
        );

        if (selected === null) return null;
        if (selected instanceof File) selected = [selected];

        var imageFiles = [];
        var skipped = [];

        for (var i = 0; i < selected.length; i++) {
            if (isSupportedImageFile(selected[i])) {
                imageFiles.push(selected[i]);
            } else {
                skipped.push(selected[i].name);
            }
        }

        if (skipped.length > 0) {
            alert(
                "以下文件不是支持的图片格式，已跳过：\n\n" +
                    previewLines(skipped, 20).join("\n")
            );
        }

        return imageFiles;
    }

    function buildPlacementPlan(doc, startPage, imageFiles) {
        var startPageIndex = getPageIndex(startPage, doc);
        if (startPageIndex < 0) {
            return {
                ok: false,
                message: "无法读取起始页面在文档中的位置。"
            };
        }

        var plan = {
            startPage: startPage,
            pages: [],
            placements: [],
            imageCount: imageFiles.length
        };

        var imageIndex = 0;

        for (var p = startPageIndex; p < doc.pages.length && imageIndex < imageFiles.length; p++) {
            var page = doc.pages[p];
            var pageFrames = collectEmptyFramesOnPage(page);

            if (pageFrames.length === 0) continue;

            var sortedResult = sortFramesByStructuredName(pageFrames);
            if (!sortedResult.ok) {
                return {
                    ok: false,
                    message:
                        "第 " +
                        pageDisplayName(page) +
                        " 上有空框架的名称不是结构化文本，已停止。\n\n" +
                        sortedResult.message
                };
            }

            var sortedFrames = sortedResult.frames;
            var pagePlan = {
                page: page,
                frames: []
            };

            for (var f = 0; f < sortedFrames.length && imageIndex < imageFiles.length; f++) {
                var placement = {
                    page: page,
                    frame: sortedFrames[f],
                    frameName: getFrameName(sortedFrames[f]),
                    imageFile: imageFiles[imageIndex],
                    imageNumber: imageIndex + 1
                };

                pagePlan.frames.push(placement);
                plan.placements.push(placement);
                imageIndex++;
            }

            if (pagePlan.frames.length > 0) {
                plan.pages.push(pagePlan);
            }
        }

        if (plan.placements.length < imageFiles.length) {
            return {
                ok: false,
                message:
                    "从起始页到文档末尾的可用空框架不足，脚本没有执行置入。\n\n" +
                    "图片数量: " +
                    imageFiles.length +
                    " 张\n" +
                    "可用空框架: " +
                    plan.placements.length +
                    " 个\n" +
                    "还缺少: " +
                    (imageFiles.length - plan.placements.length) +
                    " 个空框架\n\n" +
                    "请增加后续页面的空框架，或减少本次选择的图片数量。"
            };
        }

        return {
            ok: true,
            plan: plan
        };
    }

    function collectEmptyFramesOnPage(page) {
        var frames = [];
        var seen = {};

        try {
            for (var i = 0; i < page.allPageItems.length; i++) {
                collectEmptyFramesFromItem(page.allPageItems[i], page, frames, seen);
            }
        } catch (e1) {
            try {
                for (var p = 0; p < page.pageItems.length; p++) {
                    collectEmptyFramesFromItem(page.pageItems[p], page, frames, seen);
                }
            } catch (e2) {}
        }

        return frames;
    }

    function collectEmptyFramesFromItem(item, page, frames, seen) {
        if (!item) return;

        if (isEmptyGraphicFrame(item) && isOnPage(item, page)) {
            addFrameOnce(item, frames, seen);
            return;
        }

        try {
            if (item.pageItems && item.pageItems.length > 0) {
                for (var p = 0; p < item.pageItems.length; p++) {
                    collectEmptyFramesFromItem(item.pageItems[p], page, frames, seen);
                }
            }
        } catch (e1) {}

        try {
            if (item.allPageItems && item.allPageItems.length > 0) {
                for (var a = 0; a < item.allPageItems.length; a++) {
                    collectEmptyFramesFromItem(item.allPageItems[a], page, frames, seen);
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

    function sortFramesByStructuredName(frames) {
        var records = [];
        var badNames = [];
        var duplicateNames = {};
        var seenNames = {};

        for (var i = 0; i < frames.length; i++) {
            var frameName = getFrameName(frames[i]);
            var parsed = parseStructuredName(frameName);

            if (!parsed.ok) {
                badNames.push(frameName === "" ? "(空名称)" : frameName);
                continue;
            }

            if (seenNames[frameName]) {
                duplicateNames[frameName] = true;
            }
            seenNames[frameName] = true;

            records.push({
                frame: frames[i],
                name: frameName,
                sortParts: parsed.parts
            });
        }

        if (badNames.length > 0) {
            return {
                ok: false,
                message:
                    "以下空框架名称不包含数字结构，无法排序：\n" +
                    previewLines(badNames, 20).join("\n") +
                    "\n\n请先把这些框架在图层面板中的对象名称改成类似 image_1、image_2、slot_03 的格式。"
            };
        }

        var duplicateList = objectKeys(duplicateNames);
        if (duplicateList.length > 0) {
            return {
                ok: false,
                message:
                    "以下空框架名称重复，无法明确匹配图片：\n" +
                    previewLines(duplicateList, 20).join("\n") +
                    "\n\n请先确保同一页上的每个空框架名称唯一。"
            };
        }

        records.sort(function (a, b) {
            var byParts = compareStructuredParts(a.sortParts, b.sortParts);
            if (byParts !== 0) return byParts;
            return naturalCompare(a.name, b.name);
        });

        var sortedFrames = [];
        for (var r = 0; r < records.length; r++) {
            sortedFrames.push(records[r].frame);
        }

        return {
            ok: true,
            frames: sortedFrames
        };
    }

    function parseStructuredName(name) {
        var clean = trim(name);
        if (clean === "") {
            return { ok: false, parts: [] };
        }

        var numberMatches = clean.match(/\d+/g);
        if (!numberMatches || numberMatches.length === 0) {
            return { ok: false, parts: [] };
        }

        var parts = splitNatural(clean);
        var structuredParts = [];
        for (var i = 0; i < parts.length; i++) {
            if (/^\d+$/.test(parts[i])) {
                structuredParts.push(parseInt(parts[i], 10));
            } else {
                structuredParts.push(String(parts[i]).toLowerCase());
            }
        }

        return {
            ok: true,
            parts: structuredParts
        };
    }

    function compareStructuredParts(a, b) {
        var len = Math.min(a.length, b.length);

        for (var i = 0; i < len; i++) {
            var av = a[i];
            var bv = b[i];
            var an = typeof av === "number";
            var bn = typeof bv === "number";

            if (an && bn) {
                if (av !== bv) return av - bv;
            } else if (an !== bn) {
                return an ? -1 : 1;
            } else if (av !== bv) {
                return av < bv ? -1 : 1;
            }
        }

        return a.length - b.length;
    }

    function askConfirmPlan(plan, imageFiles) {
        var dlg = new Window("dialog", "确认跨页面图片灌入计划");
        dlg.orientation = "column";
        dlg.alignChildren = "fill";
        dlg.margins = 16;
        dlg.spacing = 10;

        var summary =
            "起始页面: " +
            pageDisplayName(plan.startPage) +
            "\n" +
            "图片数量: " +
            imageFiles.length +
            " 张\n" +
            "将使用页面: " +
            plan.pages.length +
            " 页\n" +
            "将置入框架: " +
            plan.placements.length +
            " 个\n\n" +
            "图片已按文件名自然排序。下面是每页框架与图片的对应关系：";

        dlg.add("statictext", undefined, summary, { multiline: true });

        var planText = dlg.add("edittext", undefined, buildPlanText(plan), {
            multiline: true,
            scrolling: true,
            readonly: true
        });
        planText.preferredSize = [760, 420];

        var fitPanel = dlg.add("panel", undefined, "适配方式");
        fitPanel.orientation = "column";
        fitPanel.alignChildren = "left";
        fitPanel.margins = 12;
        var fitFill = fitPanel.add("radiobutton", undefined, "按比例填充框（可能裁切边缘）");
        var fitProp = fitPanel.add("radiobutton", undefined, "按比例适合（完整显示，可能留白）");
        fitFill.value = true;

        var btnGroup = dlg.add("group");
        btnGroup.alignment = "right";
        btnGroup.add("button", undefined, "确认置入", { name: "ok" });
        btnGroup.add("button", undefined, "取消", { name: "cancel" });

        if (dlg.show() !== 1) return null;

        return {
            fitMode: fitFill.value ? FitOptions.FILL_PROPORTIONALLY : FitOptions.PROPORTIONALLY
        };
    }

    function buildPlanText(plan) {
        var lines = [];

        for (var p = 0; p < plan.pages.length; p++) {
            var pagePlan = plan.pages[p];
            lines.push(
                "第 " +
                    pageDisplayName(pagePlan.page) +
                    " - 空框架 " +
                    pagePlan.frames.length +
                    " 个"
            );

            for (var i = 0; i < pagePlan.frames.length; i++) {
                var placement = pagePlan.frames[i];
                lines.push(
                    "  " +
                        (i + 1) +
                        ". " +
                        placement.frameName +
                        "  <-  " +
                        placement.imageNumber +
                        ". " +
                        placement.imageFile.name
                );
            }

            if (p < plan.pages.length - 1) lines.push("");
        }

        return lines.join("\n");
    }

    function placeByPlan(plan, fitMode, result) {
        for (var i = 0; i < plan.placements.length; i++) {
            var placement = plan.placements[i];

            try {
                placement.frame.place(placement.imageFile);
                if (placement.frame.graphics.length > 0) {
                    placement.frame.fit(fitMode);
                    if (fitMode === FitOptions.FILL_PROPORTIONALLY) {
                        placement.frame.fit(FitOptions.CENTER_CONTENT);
                    }
                }
                result.success++;
            } catch (err) {
                result.failed.push(
                    pageDisplayName(placement.page) +
                        " / " +
                        placement.frameName +
                        " <- " +
                        placement.imageFile.name +
                        " 失败: " +
                        err.message
                );
            }
        }
    }

    function buildFinalReport(plan, result) {
        var report = "完成。\n\n";
        report += "使用页面: " + plan.pages.length + " 页\n";
        report += "计划置入: " + plan.placements.length + " 张\n";
        report += "成功置入: " + result.success + " 张\n";

        if (result.failed.length > 0) {
            report += "\n失败/警告: " + result.failed.length + " 项\n";
            report += previewLines(result.failed, 20).join("\n");
            if (result.failed.length > 20) {
                report += "\n... 还有 " + (result.failed.length - 20) + " 项未显示";
            }
        }

        report += "\n\n需要撤销时，按一次 Cmd+Z 即可撤销本次全部置入。";
        return report;
    }

    function isEmptyGraphicFrame(item) {
        if (!isGraphicFrameType(item)) return false;

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
            if (!item.parentPage || !item.parentPage.isValid) return false;
        } catch (e5) {
            return false;
        }

        return true;
    }

    function isGraphicFrameType(item) {
        if (!item) return false;

        var typeName = "";
        try {
            typeName = item.constructor.name;
        } catch (e1) {
            return false;
        }

        return typeName === "Rectangle" || typeName === "Oval" || typeName === "Polygon";
    }

    function isOnPage(item, page) {
        try {
            return item.parentPage === page;
        } catch (e1) {
            return false;
        }
    }

    function isSupportedImageFile(file) {
        if (!(file instanceof File)) return false;

        var nameLower = file.name.toLowerCase();
        for (var i = 0; i < SUPPORTED_EXTENSIONS.length; i++) {
            var ext = SUPPORTED_EXTENSIONS[i];
            if (nameLower.lastIndexOf(ext) === nameLower.length - ext.length) {
                return true;
            }
        }

        return false;
    }

    function getFrameName(frame) {
        try {
            if (frame.name !== undefined && frame.name !== null) {
                return trim(String(frame.name));
            }
        } catch (e1) {}

        return "";
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

    function getPageIndex(page, doc) {
        try {
            if (page.documentOffset !== undefined) return page.documentOffset;
        } catch (e1) {}

        try {
            for (var i = 0; i < doc.pages.length; i++) {
                if (page === doc.pages[i]) return i;
            }
        } catch (e2) {}

        return -1;
    }

    function pageDisplayName(page) {
        try {
            return (page.documentOffset + 1) + " 页/" + page.name;
        } catch (e1) {
            try {
                return String(page.name);
            } catch (e2) {}
        }

        return "未知页面";
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

    function objectKeys(obj) {
        var keys = [];
        for (var key in obj) {
            if (obj.hasOwnProperty(key)) keys.push(key);
        }
        return keys;
    }

    function previewLines(lines, limit) {
        var out = [];
        var showCount = Math.min(lines.length, limit);
        for (var i = 0; i < showCount; i++) {
            out.push("- " + lines[i]);
        }
        if (lines.length > limit) {
            out.push("... 还有 " + (lines.length - limit) + " 项未显示");
        }
        return out;
    }

    function trim(value) {
        return String(value).replace(/^\s+|\s+$/g, "");
    }
})();
