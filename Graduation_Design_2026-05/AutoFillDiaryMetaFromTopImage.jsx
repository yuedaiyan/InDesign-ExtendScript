/*
  文件: AutoFillDiaryMetaFromTopImage.jsx

  用途:
  - 按页面范围自动填充日记元信息。
  - 脚本会找每个可编辑文本框正上方同一列最高的图片，从图片文件名解析日期和序号，再匹配 diary_entries.merged.json。

  使用前:
  - 打开毕业设计 InDesign 文档。
  - 准备 diary_entries.merged.json。
  - 确认图片文件名包含 YYYY-MM-DD 或 YYYY-MM-DD_N。

  运行流程:
  1. 运行脚本。
  2. 输入要处理的页面范围。
  3. 选择或确认日记 JSON 文件。
  4. 查看预览，确认后写入 date / location / time_of_day 信息。

  注意:
  - 默认优先使用 /Users/yuedaiyan/code_school/biue_code_text/diary_entries.merged.json；找不到时会尝试同目录文件。
  - 写入动作包装为一次撤销操作。
*/
var DEFAULT_DIARY_JSON_PATH =
    "/Users/yuedaiyan/code_school/biue_code_text/diary_entries.merged.json";
var COLUMN_SIDE_TOLERANCE_POINTS = 4;
var MAX_NEAREST_IMAGE_GAP_POINTS = 36;
var MIN_HORIZONTAL_OVERLAP_RATIO = 0.45;
var SECOND_LINE_SEPARATOR = "　";

function main() {
    alert(
        "脚本已启动。\n\n" +
            "接下来请输入要处理的页面范围，并选择 diary_entries.merged.json。\n" +
            "脚本会查找每个可编辑文本框正上方最高的图片，用图片文件名匹配日记条目。"
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

    var diaryFile = chooseDiaryJSONFile();
    if (!diaryFile) return;

    var diaryIndex = readDiaryEntries(diaryFile);
    if (diaryIndex.entryCount === 0) {
        alert("没有从日记 JSON 中读取到任何条目。");
        return;
    }

    var plans = buildFillPlans(pages, diaryIndex);
    if (plans.length === 0) {
        alert(
            "没有找到可填充的文本框。\n\n" +
                "脚本只会处理未锁定文本框，并且要求其正上方同一列有图片框。"
        );
        return;
    }

    var preview = buildPreview(plans, pages, diaryIndex, diaryFile);
    if (!confirm(preview + "\n\n是否继续写入？")) return;

    var result = {
        filledTextFrames: 0,
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
        "按顶部图片填充日记元信息"
    );

    alert(buildReport(plans, result, diaryIndex));
}

function chooseDiaryJSONFile() {
    var defaultFile = File(DEFAULT_DIARY_JSON_PATH);
    if (!defaultFile.exists) {
        var scriptDefault = File(getScriptFolder().fsName + "/diary_entries.merged.json");
        if (scriptDefault.exists) defaultFile = scriptDefault;
    }

    if (defaultFile.exists) {
        if (
            confirm(
                "检测到默认日记 JSON 文件：\n" +
                    defaultFile.fsName +
                    "\n\n是否使用这个文件？\n选择“否”可手动选择其他 JSON 文件。"
            )
        ) {
            return defaultFile;
        }
    }

    var chosen = File.openDialog("请选择 diary_entries.merged.json", "*.json");
    if (!chosen) {
        alert("已取消：没有选择日记 JSON 文件。");
        return null;
    }
    return chosen;
}

function readDiaryEntries(file) {
    file.encoding = "UTF-8";
    if (!file.open("r")) {
        throw new Error("无法读取日记 JSON 文件：\n" + file.fsName);
    }

    var text = "";
    try {
        text = file.read();
    } finally {
        file.close();
    }

    var data = parseJSONText(text);
    var entries = normalizeDiaryEntries(data);
    var index = {
        entryCount: entries.length,
        byDate: {}
    };

    for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        var date = valueOrBlank(entry.date);
        if (!date) continue;
        if (!index.byDate[date]) index.byDate[date] = [];
        index.byDate[date].push(entry);
    }

    return index;
}

function parseJSONText(text) {
    text = String(text).replace(/^\uFEFF/, "");
    if (typeof JSON !== "undefined" && JSON.parse) {
        return JSON.parse(text);
    }
    return eval("(" + text + ")");
}

function normalizeDiaryEntries(data) {
    if (data instanceof Array) return data;

    try {
        if (data.entries instanceof Array) return data.entries;
    } catch (e1) {}

    try {
        if (data.diary_entries instanceof Array) return data.diary_entries;
    } catch (e2) {}

    return [];
}

function buildFillPlans(pages, diaryIndex) {
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

            var topImageFrame = imagesAbove[0];
            var linkInfo = getImageLinkInfo(topImageFrame);
            var linkFileName = linkInfo.linkName || getFileName(linkInfo.linkPath);
            var fileInfo = parseDiaryImageFileName(linkFileName);
            var lookup = lookupDiaryEntry(fileInfo, diaryIndex);

            plans.push({
                page: page,
                textFrame: frame,
                imageFrame: topImageFrame,
                linkName: linkFileName,
                fileInfo: fileInfo,
                lookup: lookup,
                text: lookup.text
            });
        }
    }

    return plans;
}

function parseDiaryImageFileName(linkName) {
    var baseName = getBaseName(linkName);
    var match = baseName.match(/^(\d{4}-\d{2}-\d{2})(?:_(\d+))?/);

    if (!match) {
        return {
            ok: false,
            date: "",
            sequence: 1,
            baseName: baseName,
            error: "文件名中没有找到日期"
        };
    }

    var sequence = match[2] ? parseInt(match[2], 10) : 1;
    if (!isFinite(sequence) || sequence < 1) sequence = 1;

    return {
        ok: true,
        date: match[1],
        sequence: sequence,
        baseName: baseName,
        error: ""
    };
}

function lookupDiaryEntry(fileInfo, diaryIndex) {
    if (!fileInfo.ok) {
        return {
            entry: null,
            text: "-",
            error: fileInfo.error
        };
    }

    var entries = diaryIndex.byDate[fileInfo.date] || [];
    if (entries.length === 0) {
        return {
            entry: null,
            text: "-",
            error: "日记 JSON 中没有日期 " + fileInfo.date
        };
    }

    if (fileInfo.sequence > entries.length) {
        return {
            entry: null,
            text: "-",
            error:
                fileInfo.date +
                " 只有 " +
                entries.length +
                " 条，找不到第 " +
                fileInfo.sequence +
                " 条"
        };
    }

    var entry = entries[fileInfo.sequence - 1];
    return {
        entry: entry,
        text: formatDiaryMeta(entry),
        error: ""
    };
}

function formatDiaryMeta(entry) {
    var date = valueOrBlank(entry.date);
    var location = valueOrBlank(entry.location);
    var timeOfDay = valueOrBlank(entry.time_of_day);
    var secondLineParts = [];

    if (location) secondLineParts.push(location);
    if (timeOfDay) secondLineParts.push(timeOfDay);

    return date + "\r" + secondLineParts.join(SECOND_LINE_SEPARATOR);
}

function applyFillPlans(plans, result) {
    for (var i = 0; i < plans.length; i++) {
        var plan = plans[i];
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

function buildPreview(plans, pages, diaryIndex, diaryFile) {
    var missing = countMissingPlans(plans);
    var text =
        "即将按顶部图片填充日记元信息。\n\n" +
        "页面数：" +
        pages.length +
        "\n" +
        "将填充文本框：" +
        plans.length +
        " 个\n" +
        "日记条目：" +
        diaryIndex.entryCount +
        " 条\n" +
        "日记 JSON：\n" +
        diaryFile.fsName;

    if (missing > 0) {
        text += "\n\n有 " + missing + " 个图片文件未能匹配日记条目，会写为“-”。";
    }

    text += "\n\n写入后可用一次 Cmd+Z 撤销本次全部填充。";
    return text;
}

function buildReport(plans, result, diaryIndex) {
    var missing = countMissingPlans(plans);
    var report =
        "完成。\n\n" +
        "已填充文本框：" +
        result.filledTextFrames +
        " / " +
        plans.length +
        "\n" +
        "未匹配条目：" +
        missing +
        "\n" +
        "日记条目：" +
        diaryIndex.entryCount;

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

    if (missing > 0) {
        report += "\n\n未匹配示例：\n";
        var shown = 0;
        for (var p = 0; p < plans.length && shown < 10; p++) {
            if (plans[p].lookup.entry) continue;
            report +=
                "- " +
                getPageDisplayName(plans[p].page) +
                " / " +
                plans[p].linkName +
                "：" +
                plans[p].lookup.error +
                "\n";
            shown++;
        }
        if (missing > shown) {
            report += "... 还有 " + (missing - shown) + " 项未显示\n";
        }
    }

    report += "\n\n需要撤销时，按一次 Cmd+Z 即可撤销本次全部填充。";
    return report;
}

function countMissingPlans(plans) {
    var count = 0;
    for (var i = 0; i < plans.length; i++) {
        if (!plans[i].lookup.entry) count++;
    }
    return count;
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

function getBaseName(name) {
    name = valueOrBlank(name);
    return name.replace(/\.[^\.]+$/, "");
}

function getFileName(path) {
    path = valueOrBlank(path).replace(/\\/g, "/");
    var parts = path.split("/");
    return parts.length > 0 ? parts[parts.length - 1] : path;
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
    alert("按顶部图片填充日记元信息失败：\n\n" + err.message + lineText);
}
