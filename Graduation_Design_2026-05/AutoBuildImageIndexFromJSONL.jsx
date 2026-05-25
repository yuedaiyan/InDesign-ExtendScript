/*
  AutoBuildImageIndexFromJSONL.jsx

  按指定页面自动生成图片索引：
  - 找到页面上未锁定、可编辑的文本框
  - 对每个文本框，收集其正上方同一列的图片框
  - 图片框按从上到下排序，命名为 Form 1, Form 2 ...
  - 从 JSONL 图片索引中查找每张图片出现的页码
  - 将 Form 和页码表写入对应文本框

  写入文本框和命名图片框会被包装为一次 InDesign 撤销操作。
*/

var FORM_NAME_PREFIX = "Form ";
var COLUMN_SIDE_TOLERANCE_POINTS = 4;
var MAX_NEAREST_IMAGE_GAP_POINTS = 36;
var MIN_HORIZONTAL_OVERLAP_RATIO = 0.45;

function main() {
    alert(
        "脚本已启动。\n\n" +
            "接下来请输入要处理的页面范围，并选择图片信息 JSONL 文件。\n" +
            "脚本会自动寻找这些页面上未锁定文本框正上方的图片，并生成 Form 页码索引。"
    );

    if (app.documents.length === 0) {
        alert("请先打开一个 InDesign 文档。");
        return;
    }

    var doc = app.activeDocument;
    var rangeText = prompt(
        "请输入要处理的页面范围（使用 InDesign 中显示的页码）。\n示例：430 或 420-430, 435",
        buildDefaultPageRange(doc)
    );
    if (rangeText === null) return;

    var pages = parsePageRangeToPages(doc, rangeText);
    if (!pages) return;

    var indexFile = chooseImageIndexFile();
    if (!indexFile) return;

    var imageIndex = readImageIndexJSONL(indexFile);
    if (imageIndex.recordCount === 0) {
        alert("JSONL 文件中没有读取到任何图片记录。");
        return;
    }

    var plans = buildFillPlans(pages, imageIndex);
    if (plans.length === 0) {
        alert(
            "没有找到可填充的文本框。\n\n" +
                "脚本只会处理未锁定文本框，并且要求其正上方同一列有图片框。"
        );
        return;
    }

    var preview = buildPreview(plans, pages, imageIndex, indexFile);
    if (!confirm(preview + "\n\n是否继续写入？")) return;

    var result = {
        filledTextFrames: 0,
        namedImageFrames: 0,
        failed: []
    };

    app.doScript(
        function () {
            var oldRedraw = app.scriptPreferences.enableRedraw;
            app.scriptPreferences.enableRedraw = false;

            try {
                applyFillPlans(plans, result);
            } finally {
                app.scriptPreferences.enableRedraw = oldRedraw;
            }
        },
        ScriptLanguage.JAVASCRIPT,
        undefined,
        UndoModes.ENTIRE_SCRIPT,
        "自动建立图片索引"
    );

    alert(buildReport(plans, result, imageIndex));
}

function chooseImageIndexFile() {
    var scriptFolder = getScriptFolder();
    var defaultFile = File(
        scriptFolder.fsName + "/selected_indd_files_image_file_index.jsonl"
    );

    if (defaultFile.exists) {
        if (
            confirm(
                "检测到默认图片信息文件：\n" +
                    defaultFile.fsName +
                    "\n\n是否使用这个文件？\n选择“否”可手动选择其他 JSONL 文件。"
            )
        ) {
            return defaultFile;
        }
    }

    var chosen = File.openDialog("请选择图片信息 JSONL 文件", "*.jsonl;*.ndjson");
    if (!chosen) {
        alert("已取消：没有选择图片信息文件。");
        return null;
    }
    return chosen;
}

function readImageIndexJSONL(file) {
    file.encoding = "UTF-8";
    if (!file.open("r")) {
        throw new Error("无法读取 JSONL 文件：\n" + file.fsName);
    }

    var index = {
        recordCount: 0,
        byPath: {},
        byName: {},
        duplicateName: {},
        parseErrors: []
    };

    var lineNumber = 0;
    try {
        while (!file.eof) {
            var line = file.readln();
            lineNumber++;
            line = trim(line);
            if (line === "") continue;

            var record = null;
            try {
                record = parseJSONLine(line);
            } catch (parseError) {
                index.parseErrors.push(
                    "第 " + lineNumber + " 行：" + parseError.message
                );
                continue;
            }

            addIndexRecord(index, record);
        }
    } finally {
        file.close();
    }

    return index;
}

function parseJSONLine(line) {
    if (typeof JSON !== "undefined" && JSON.parse) {
        return JSON.parse(line);
    }
    return eval("(" + line + ")");
}

function addIndexRecord(index, record) {
    if (!record) return;

    index.recordCount++;

    addRecordPathKey(index.byPath, record.imageKey, record);
    addRecordPathKey(index.byPath, record.linkPath, record);

    var linkName = valueOrBlank(record.linkName);
    if (linkName) {
        var nameKey = normalizeName(linkName);
        if (index.byName[nameKey] && index.byName[nameKey] !== record) {
            index.duplicateName[nameKey] = true;
        } else {
            index.byName[nameKey] = record;
        }
    }
}

function addRecordPathKey(map, value, record) {
    var key = normalizePath(value);
    if (!key) return;
    map[key] = record;
}

function buildFillPlans(pages, imageIndex) {
    var plans = [];

    for (var p = 0; p < pages.length; p++) {
        var page = pages[p];
        var textFrames = collectInteractiveTextFramesFromPage(page);
        var imageFrames = collectImageFramesFromPage(page);

        textFrames.sort(sortItemsTopLeft);
        imageFrames.sort(sortItemsTopLeft);

        for (var t = 0; t < textFrames.length; t++) {
            var frame = textFrames[t];
            var imagesAbove = findImagesAboveTextFrame(frame, imageFrames);
            if (imagesAbove.length === 0) continue;

            var lines = [];
            var entries = [];

            for (var i = 0; i < imagesAbove.length; i++) {
                var formName = FORM_NAME_PREFIX + String(i + 1);
                var lookup = lookupImagePages(imagesAbove[i], imageIndex);
                lines.push(formName + ":\t" + lookup.pageText);
                entries.push({
                    imageFrame: imagesAbove[i],
                    formName: formName,
                    lookup: lookup
                });
            }

            plans.push({
                page: page,
                textFrame: frame,
                entries: entries,
                text: lines.join("\r")
            });
        }
    }

    return plans;
}

function collectInteractiveTextFramesFromPage(page) {
    var result = [];
    var seen = {};

    try {
        for (var i = 0; i < page.allPageItems.length; i++) {
            var item = resolveItem(page.allPageItems[i]);
            if (!isTextFrame(item)) continue;
            if (!isSamePage(item, page)) continue;
            if (!isInteractivePageItem(item)) continue;
            addUniqueItem(result, seen, item);
        }
    } catch (error) {}

    return result;
}

function collectImageFramesFromPage(page) {
    var result = [];
    var seen = {};

    try {
        for (var i = 0; i < page.allGraphics.length; i++) {
            var graphic = resolveItem(page.allGraphics[i]);
            var frame = getGraphicFrame(graphic);
            if (!frame) continue;
            if (!isSamePage(frame, page)) continue;
            if (!hasBounds(frame)) continue;
            if (!isPageItemVisible(frame)) continue;
            addUniqueItem(result, seen, frame);
        }
    } catch (error) {}

    return result;
}

function findImagesAboveTextFrame(textFrame, imageFrames) {
    var textBounds = getPageRelativeBounds(textFrame);
    if (!textBounds) return [];

    var textTop = textBounds[0];
    var candidates = [];
    var nearestGap = null;

    for (var i = 0; i < imageFrames.length; i++) {
        var imageBounds = getPageRelativeBounds(imageFrames[i]);
        if (!imageBounds) continue;

        var imageBottom = imageBounds[2];
        if (imageBottom > textTop + COLUMN_SIDE_TOLERANCE_POINTS) continue;
        if (!isHorizontallyAligned(textBounds, imageBounds)) continue;

        var gap = textTop - imageBottom;
        if (gap < 0) gap = 0;
        if (nearestGap === null || gap < nearestGap) nearestGap = gap;

        candidates.push({
            item: imageFrames[i],
            bounds: imageBounds
        });
    }

    if (nearestGap === null || nearestGap > MAX_NEAREST_IMAGE_GAP_POINTS) {
        return [];
    }

    candidates.sort(function (a, b) {
        return sortBoundsTopLeft(a.bounds, b.bounds);
    });

    var out = [];
    for (var c = 0; c < candidates.length; c++) {
        out.push(candidates[c].item);
    }
    return out;
}

function isHorizontallyAligned(textBounds, imageBounds) {
    var textLeft = textBounds[1] - COLUMN_SIDE_TOLERANCE_POINTS;
    var textRight = textBounds[3] + COLUMN_SIDE_TOLERANCE_POINTS;
    var imageLeft = imageBounds[1];
    var imageRight = imageBounds[3];
    var imageCenter = (imageLeft + imageRight) / 2;

    if (imageCenter >= textLeft && imageCenter <= textRight) {
        return true;
    }

    var overlap = Math.min(textRight, imageRight) - Math.max(textLeft, imageLeft);
    if (overlap <= 0) return false;

    var textWidth = Math.max(1, textRight - textLeft);
    var imageWidth = Math.max(1, imageRight - imageLeft);
    var smaller = Math.min(textWidth, imageWidth);

    return overlap / smaller >= MIN_HORIZONTAL_OVERLAP_RATIO;
}

function lookupImagePages(imageFrame, imageIndex) {
    var info = getImageLinkInfo(imageFrame);
    var record = null;
    var matchedBy = "";

    if (info.linkPath) {
        record = imageIndex.byPath[normalizePath(info.linkPath)];
        if (record) matchedBy = "linkPath";
    }

    if (!record && info.linkName) {
        var nameKey = normalizeName(info.linkName);
        if (!imageIndex.duplicateName[nameKey]) {
            record = imageIndex.byName[nameKey];
            if (record) matchedBy = "linkName";
        }
    }

    if (!record) {
        return {
            pageText: "-",
            record: null,
            matchedBy: "",
            linkName: info.linkName,
            linkPath: info.linkPath
        };
    }

    return {
        pageText: formatRecordPages(record),
        record: record,
        matchedBy: matchedBy,
        linkName: info.linkName,
        linkPath: info.linkPath
    };
}

function getImageLinkInfo(imageFrame) {
    var graphic = null;
    try {
        if (imageFrame.allGraphics && imageFrame.allGraphics.length > 0) {
            graphic = imageFrame.allGraphics[0];
        }
    } catch (e1) {}

    if (!graphic) {
        try {
            if (imageFrame.graphics && imageFrame.graphics.length > 0) {
                graphic = imageFrame.graphics[0];
            }
        } catch (e2) {}
    }

    var link = safeRead(graphic, "itemLink");
    return {
        linkName: valueOrBlank(safeRead(link, "name")),
        linkPath: valueOrBlank(safeRead(link, "filePath"))
    };
}

function formatRecordPages(record) {
    var pages = safeRead(record, "pages");
    if (!pages || !pages.length) return "无页码";

    var values = [];
    var seen = {};

    for (var i = 0; i < pages.length; i++) {
        var pageName = valueOrBlank(pages[i].pageName);
        if (!pageName || seen[pageName]) continue;
        seen[pageName] = true;
        values.push(pageName);
    }

    values.sort(naturalCompare);
    return values.length > 0 ? values.join(", ") : "无页码";
}

function applyFillPlans(plans, result) {
    for (var p = 0; p < plans.length; p++) {
        var plan = plans[p];

        for (var i = 0; i < plan.entries.length; i++) {
            try {
                nameImageFrame(plan.entries[i].imageFrame, plan.entries[i].formName);
                result.namedImageFrames++;
            } catch (nameError) {
                result.failed.push(
                    getPageDisplayName(plan.page) +
                        " " +
                        plan.entries[i].formName +
                        " 命名失败：" +
                        nameError.message
                );
            }
        }

        try {
            plan.textFrame.contents = "";
            plan.textFrame.contents = plan.text;
            result.filledTextFrames++;
        } catch (fillError) {
            result.failed.push(
                getPageDisplayName(plan.page) + " 文本框写入失败：" + fillError.message
            );
        }
    }
}

function nameImageFrame(imageFrame, formName) {
    imageFrame.name = formName;
    try {
        imageFrame.label = formName;
    } catch (e1) {}
    try {
        imageFrame.insertLabel("image_index_form", formName);
    } catch (e2) {}
}

function buildPreview(plans, pages, imageIndex, indexFile) {
    var imageCount = 0;
    var missing = 0;

    for (var p = 0; p < plans.length; p++) {
        imageCount += plans[p].entries.length;
        for (var i = 0; i < plans[p].entries.length; i++) {
            if (!plans[p].entries[i].lookup.record) missing++;
        }
    }

    var text =
        "即将生成图片索引。\n\n" +
        "页面数：" +
        pages.length +
        "\n" +
        "将填充文本框：" +
        plans.length +
        " 个\n" +
        "检测到图片框：" +
        imageCount +
        " 个\n" +
        "JSONL 图片记录：" +
        imageIndex.recordCount +
        " 条\n" +
        "JSONL 文件：\n" +
        indexFile.fsName;

    if (missing > 0) {
        text += "\n\n有 " + missing + " 个图片框未能在 JSONL 中匹配，会写为“未找到”。";
    }

    if (imageIndex.parseErrors.length > 0) {
        text +=
            "\n\n读取 JSONL 时跳过 " +
            imageIndex.parseErrors.length +
            " 行解析失败记录。";
    }

    text += "\n\n写入后可用一次 Cmd+Z 撤销本次全部命名和填充。";
    return text;
}

function buildReport(plans, result, imageIndex) {
    var imageCount = 0;
    var missing = 0;

    for (var p = 0; p < plans.length; p++) {
        imageCount += plans[p].entries.length;
        for (var i = 0; i < plans[p].entries.length; i++) {
            if (!plans[p].entries[i].lookup.record) missing++;
        }
    }

    var report =
        "完成。\n\n" +
        "已填充文本框：" +
        result.filledTextFrames +
        " / " +
        plans.length +
        "\n" +
        "已命名图片框：" +
        result.namedImageFrames +
        " / " +
        imageCount +
        "\n" +
        "未匹配图片：" +
        missing;

    if (imageIndex.parseErrors.length > 0) {
        report += "\nJSONL 解析失败行：" + imageIndex.parseErrors.length;
    }

    if (result.failed.length > 0) {
        report += "\n\n失败详情：\n";
        var limit = Math.min(result.failed.length, 20);
        for (var i = 0; i < limit; i++) {
            report += "- " + result.failed[i] + "\n";
        }
        if (result.failed.length > limit) {
            report += "... 还有 " + (result.failed.length - limit) + " 项未显示\n";
        }
    }

    report += "\n\n需要撤销时，按一次 Cmd+Z 即可撤销本次全部写入和命名。";
    return report;
}

function parsePageRangeToPages(doc, text) {
    var clean = String(text)
        .replace(/\s/g, "")
        .replace(/，/g, ",")
        .replace(/[—–]/g, "-");

    if (clean === "") {
        alert("请输入页面范围。");
        return null;
    }

    var parts = clean.split(",");
    var pages = [];
    var seen = {};
    var missingParts = [];

    for (var i = 0; i < parts.length; i++) {
        var part = parts[i];
        if (part === "") continue;

        var rangeMatch = part.match(/^(\d+)-(\d+)$/);
        if (rangeMatch) {
            var start = parseInt(rangeMatch[1], 10);
            var end = parseInt(rangeMatch[2], 10);

            if (start > end) {
                var temp = start;
                start = end;
                end = temp;
            }

            if (addPagesByActualPageNumberRange(doc, pages, seen, start, end) === 0) {
                missingParts.push(part);
            }
        } else {
            if (addPagesByActualPageName(doc, pages, seen, part) === 0) {
                missingParts.push(part);
            }
        }
    }

    if (missingParts.length > 0) {
        alert(
            "以下实际页码在当前文档中没有找到：\n\n" +
                missingParts.join(", ") +
                "\n\n请注意：这里使用的是 InDesign 中显示的页码，不是页面在文档中的顺序。"
        );
        return null;
    }

    if (pages.length === 0) {
        alert("没有找到有效页面。");
        return null;
    }

    pages.sort(function (a, b) {
        return a.documentOffset - b.documentOffset;
    });
    return pages;
}

function addPagesByActualPageNumberRange(doc, pages, seen, start, end) {
    var matched = 0;

    for (var i = 0; i < doc.pages.length; i++) {
        var pageNumber = getActualPageNumber(doc.pages[i]);
        if (pageNumber === null) continue;
        if (pageNumber < start || pageNumber > end) continue;
        addPage(pages, seen, doc.pages[i]);
        matched++;
    }

    return matched;
}

function addPagesByActualPageName(doc, pages, seen, pageNameText) {
    var wantedNumber = parseUnsignedInteger(pageNameText);
    var matched = 0;

    for (var i = 0; i < doc.pages.length; i++) {
        var page = doc.pages[i];
        var pageName = String(page.name);
        var pageNumber = getActualPageNumber(page);

        if (
            pageName === pageNameText ||
            (wantedNumber !== null && pageNumber === wantedNumber)
        ) {
            addPage(pages, seen, page);
            matched++;
        }
    }

    return matched;
}

function addPage(pages, seen, page) {
    var key = getItemKey(page);
    if (key !== null && seen[key]) return;
    pages.push(page);
    if (key !== null) seen[key] = true;
}

function buildDefaultPageRange(doc) {
    try {
        if (app.selection && app.selection.length > 0) {
            var selectedPage = getParentPage(app.selection[0]);
            var selectedNumber = getActualPageNumber(selectedPage);
            if (selectedNumber !== null) return String(selectedNumber);
        }
    } catch (e1) {}

    try {
        var page = app.activeWindow.activePage;
        var pageNumber = getActualPageNumber(page);
        if (pageNumber !== null) return String(pageNumber);
    } catch (e2) {}

    try {
        if (doc.pages.length > 0) return String(doc.pages[0].name);
    } catch (e3) {}

    return "";
}

function getActualPageNumber(page) {
    if (!page) return null;
    return parseUnsignedInteger(String(page.name));
}

function parseUnsignedInteger(text) {
    if (!/^\d+$/.test(String(text))) return null;
    return parseInt(text, 10);
}

function resolveItem(item) {
    if (item && typeof item.getElements === "function") {
        try {
            var els = item.getElements();
            if (els && els.length > 0) return els[0];
        } catch (e1) {}
    }
    return item;
}

function getGraphicFrame(graphic) {
    if (!graphic) return null;

    try {
        if (graphic.parent && isValidItem(graphic.parent)) {
            return resolveItem(graphic.parent);
        }
    } catch (e1) {}

    return null;
}

function addUniqueItem(result, seen, item) {
    var key = getItemKey(item);
    if (key !== null) {
        if (seen[key]) return;
        seen[key] = true;
    }
    result.push(item);
}

function isTextFrame(item) {
    if (!isValidItem(item)) return false;

    try {
        if (getTypeName(item) === "TextFrame") return true;
    } catch (e1) {}

    try {
        if (item.constructor && String(item.constructor.name) === "TextFrame") {
            return true;
        }
    } catch (e2) {}

    return false;
}

function getTypeName(item) {
    try {
        if (item.reflect && item.reflect.name) return String(item.reflect.name);
    } catch (e1) {}

    try {
        if (item.constructor && item.constructor.name) {
            return String(item.constructor.name);
        }
    } catch (e2) {}

    return "";
}

function isInteractivePageItem(item) {
    if (!isValidItem(item)) return false;
    if (!isPageItemVisible(item)) return false;
    if (isItemOrAncestorLocked(item)) return false;

    try {
        if (item.itemLayer) {
            if (item.itemLayer.locked) return false;
            if (item.itemLayer.visible === false) return false;
        }
    } catch (e1) {}

    return true;
}

function isPageItemVisible(item) {
    if (!isValidItem(item)) return false;

    try {
        if (item.visible === false) return false;
    } catch (e1) {}

    try {
        if (item.itemLayer && item.itemLayer.visible === false) return false;
    } catch (e2) {}

    return true;
}

function isItemOrAncestorLocked(item) {
    var current = item;
    var guard = 0;

    while (current && guard < 30) {
        guard++;
        try {
            if (current.locked === true) return true;
        } catch (e1) {}

        try {
            if (current.itemLayer && current.itemLayer.locked === true) return true;
        } catch (e2) {}

        try {
            current = current.parent;
        } catch (e3) {
            break;
        }
    }

    return false;
}

function isValidItem(item) {
    if (!item) return false;

    try {
        if (item.isValid !== undefined && !item.isValid) return false;
    } catch (e1) {
        return false;
    }

    return true;
}

function hasBounds(item) {
    try {
        var b = item.geometricBounds;
        return b && b.length === 4;
    } catch (e1) {}
    return false;
}

function isSamePage(item, page) {
    var parentPage = getParentPage(item);
    if (!parentPage) return false;
    return getItemKey(parentPage) === getItemKey(page);
}

function getParentPage(item) {
    if (!item) return null;

    try {
        if (item.parentPage && item.parentPage.isValid) return item.parentPage;
    } catch (e1) {}

    try {
        var parent = item.parent;
        var guard = 0;
        while (parent && isValidItem(parent) && guard < 30) {
            guard++;
            if (parent.parentPage && parent.parentPage.isValid) {
                return parent.parentPage;
            }
            parent = parent.parent;
        }
    } catch (e2) {}

    return null;
}

function getPageRelativeBounds(item) {
    try {
        var page = getParentPage(item);
        if (!page) return null;

        var itemBounds = item.geometricBounds;
        var pageBounds = page.bounds;

        return [
            Number(itemBounds[0]) - Number(pageBounds[0]),
            Number(itemBounds[1]) - Number(pageBounds[1]),
            Number(itemBounds[2]) - Number(pageBounds[0]),
            Number(itemBounds[3]) - Number(pageBounds[1])
        ];
    } catch (e1) {
        return null;
    }
}

function sortItemsTopLeft(a, b) {
    return sortBoundsTopLeft(getPageRelativeBounds(a), getPageRelativeBounds(b));
}

function sortBoundsTopLeft(a, b) {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;

    var topDiff = Number(a[0]) - Number(b[0]);
    if (Math.abs(topDiff) > 1) return topDiff;
    return Number(a[1]) - Number(b[1]);
}

function getItemKey(item) {
    try {
        if (item.id !== undefined) return String(item.id);
    } catch (e1) {}

    return null;
}

function getPageDisplayName(page) {
    if (!page) return "未知页面";

    try {
        return "第 " + page.name + " 页";
    } catch (e1) {}

    return "未知页面";
}

function safeRead(item, propertyName) {
    if (!item) return null;
    try {
        return item[propertyName];
    } catch (e1) {}
    return null;
}

function valueOrBlank(value) {
    if (value === null || value === undefined) return "";
    return String(value);
}

function normalizePath(value) {
    value = valueOrBlank(value);
    if (!value) return "";
    value = value.replace(/\\/g, "/").replace(/\/+/g, "/");
    return value.toLowerCase();
}

function normalizeName(value) {
    value = valueOrBlank(value);
    if (!value) return "";
    return value.toLowerCase();
}

function naturalCompare(a, b) {
    a = String(a);
    b = String(b);

    var ax = splitNatural(a);
    var bx = splitNatural(b);
    var length = Math.min(ax.length, bx.length);

    for (var i = 0; i < length; i++) {
        if (ax[i] === bx[i]) continue;

        var an = parseInt(ax[i], 10);
        var bn = parseInt(bx[i], 10);
        var aIsNumber = /^\d+$/.test(ax[i]);
        var bIsNumber = /^\d+$/.test(bx[i]);

        if (aIsNumber && bIsNumber) return an - bn;
        return ax[i] < bx[i] ? -1 : 1;
    }

    return ax.length - bx.length;
}

function splitNatural(text) {
    var result = [];
    var pattern = /(\d+|\D+)/g;
    var match;

    while ((match = pattern.exec(text)) !== null) {
        result.push(match[0]);
    }

    return result;
}

function trim(text) {
    return String(text).replace(/^\s+|\s+$/g, "");
}

function getScriptFolder() {
    try {
        if ($.fileName) {
            return File($.fileName).parent;
        }
    } catch (error) {}
    return Folder.current;
}

try {
    main();
} catch (err) {
    var lineText = err.line ? "\n\n行号：" + err.line : "";
    alert("自动建立图片索引失败：\n\n" + err.message + lineText);
}
