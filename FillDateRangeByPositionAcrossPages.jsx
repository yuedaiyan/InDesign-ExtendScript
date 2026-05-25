// FillDateRangeByPositionAcrossPages.jsx

(function () {
    var POSITION_TOLERANCE_POINTS = 2;

    function main() {
        if (app.documents.length === 0) {
            alert("请先打开一个 InDesign 文档。");
            return;
        }

        var doc = app.activeDocument;
        var sourceFrame = getSelectedTextFrame();
        if (!sourceFrame) {
            alert("请先选中一个文本框。");
            return;
        }

        var sourcePage = getParentPage(sourceFrame);
        if (!sourcePage) {
            alert("无法判断所选文本框所在页面，请确认它位于正常文档页面上。");
            return;
        }

        var sourceBounds = getPageRelativeBounds(sourceFrame);
        if (!sourceBounds) {
            alert("无法读取所选文本框的位置。");
            return;
        }

        var rangeText = prompt(
            "请输入要处理的页面范围（使用 InDesign 中显示的页码）。\n示例：24-40, 48",
            buildDefaultPageRange(doc, sourcePage)
        );
        if (rangeText === null) return;

        var pages = parsePageRangeToPages(doc, rangeText);
        if (!pages) return;

        var targetFrames = collectTargetFramesByPosition(pages, sourceBounds);
        if (targetFrames.length === 0) {
            alert("指定页面范围内，没有在相同位置找到文本框。");
            return;
        }

        var targetFrameKeys = buildFrameKeySet(targetFrames);
        var plans = buildFillPlans(targetFrames, targetFrameKeys);

        if (plans.length === 0) {
            alert("找到了同位置文本框，但这些文本框所在跨页没有可用的有效日期。");
            return;
        }

        var result = {
            filled: 0,
            skippedNoDates: targetFrames.length - plans.length,
            failed: []
        };

        app.doScript(
            function () {
                var oldRedraw = app.scriptPreferences.enableRedraw;
                app.scriptPreferences.enableRedraw = false;

                try {
                    for (var i = 0; i < plans.length; i++) {
                        try {
                            plans[i].frame.contents = "";
                            plans[i].frame.contents = plans[i].text;
                            result.filled++;
                        } catch (fillErr) {
                            result.failed.push(
                                getPageDisplayName(getParentPage(plans[i].frame)) +
                                    "：" +
                                    fillErr.message
                            );
                        }
                    }
                } finally {
                    app.scriptPreferences.enableRedraw = oldRedraw;
                }
            },
            ScriptLanguage.JAVASCRIPT,
            undefined,
            UndoModes.ENTIRE_SCRIPT,
            "按位置批量填充跨页日期范围"
        );

        alert(buildReport(result, targetFrames.length, plans.length));
    }

    function collectTargetFramesByPosition(pages, sourceBounds) {
        var result = [];
        var seen = {};

        for (var i = 0; i < pages.length; i++) {
            var frames = collectTextFramesFromPage(pages[i]);
            var best = findBestFrameAtPosition(frames, sourceBounds);
            if (!best) continue;

            var key = getItemKey(best);
            if (key !== null && seen[key]) continue;
            if (key !== null) seen[key] = true;

            result.push(best);
        }

        return result;
    }

    function findBestFrameAtPosition(frames, sourceBounds) {
        var best = null;
        var bestScore = null;

        for (var i = 0; i < frames.length; i++) {
            var bounds = getPageRelativeBounds(frames[i]);
            if (!bounds) continue;

            var score = getBoundsDiffScore(sourceBounds, bounds);
            if (score > POSITION_TOLERANCE_POINTS) continue;

            if (bestScore === null || score < bestScore) {
                best = frames[i];
                bestScore = score;
            }
        }

        return best;
    }

    function getBoundsDiffScore(a, b) {
        var score = 0;
        for (var i = 0; i < 4; i++) {
            var diff = Math.abs(Number(a[i]) - Number(b[i]));
            if (diff > score) score = diff;
        }
        return score;
    }

    function buildFillPlans(targetFrames, targetFrameKeys) {
        var plans = [];

        for (var i = 0; i < targetFrames.length; i++) {
            var frame = targetFrames[i];
            var spread = getSpreadFromPage(getParentPage(frame));
            if (!spread) continue;

            var dateList = collectDatesFromSpread(spread, targetFrameKeys);
            if (dateList.length === 0) continue;

            dateList.sort();
            plans.push({
                frame: frame,
                text: dateList[0] + "\u2014" + dateList[dateList.length - 1]
            });
        }

        return plans;
    }

    function collectDatesFromSpread(spread, excludedFrameKeys) {
        var textFrames = collectTextFramesFromSpread(spread);
        var dates = [];
        var seenDates = {};

        for (var i = 0; i < textFrames.length; i++) {
            var textFrame = textFrames[i];
            var key = getItemKey(textFrame);
            if (key !== null && excludedFrameKeys[key]) continue;

            var text = safeContents(textFrame);
            if (text === "") continue;

            appendValidDates(text, dates, seenDates);
        }

        return dates;
    }

    function appendValidDates(text, dates, seenDates) {
        var pattern = /(^|[^0-9])([0-9]{4}-[0-9]{2}-[0-9]{2})(?![0-9])/g;
        var match;

        while ((match = pattern.exec(text)) !== null) {
            var dateText = match[2];
            if (!isValidDateText(dateText)) continue;
            if (seenDates[dateText]) continue;

            seenDates[dateText] = true;
            dates.push(dateText);
        }
    }

    function isValidDateText(dateText) {
        var year = parseInt(dateText.substr(0, 4), 10);
        var month = parseInt(dateText.substr(5, 2), 10);
        var day = parseInt(dateText.substr(8, 2), 10);

        if (month < 1 || month > 12) return false;
        if (day < 1 || day > daysInMonth(year, month)) return false;

        return true;
    }

    function daysInMonth(year, month) {
        if (month === 2) return isLeapYear(year) ? 29 : 28;
        if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
        return 31;
    }

    function isLeapYear(year) {
        return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    }

    function collectTextFramesFromSpread(spread) {
        var result = [];
        var seen = {};

        try {
            for (var i = 0; i < spread.allPageItems.length; i++) {
                collectTextFrame(spread.allPageItems[i], spread, result, seen);
            }
        } catch (e1) {
            try {
                for (var p = 0; p < spread.pages.length; p++) {
                    for (var j = 0; j < spread.pages[p].allPageItems.length; j++) {
                        collectTextFrame(
                            spread.pages[p].allPageItems[j],
                            spread,
                            result,
                            seen
                        );
                    }
                }
            } catch (e2) {}
        }

        return result;
    }

    function collectTextFramesFromPage(page) {
        var result = [];
        var seen = {};

        try {
            for (var i = 0; i < page.allPageItems.length; i++) {
                collectTextFrame(page.allPageItems[i], page.parent, result, seen);
            }
        } catch (e1) {}

        return result;
    }

    function collectTextFrame(item, spread, result, seen) {
        if (!isTextFrame(item)) return;
        if (!isOnSpread(item, spread)) return;

        var key = getItemKey(item);
        if (key !== null) {
            if (seen[key]) return;
            seen[key] = true;
        }

        result.push(item);
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

    function buildDefaultPageRange(doc, sourcePage) {
        var sourceNumber = getActualPageNumber(sourcePage);
        var maxNumber = null;

        for (var i = 0; i < doc.pages.length; i++) {
            var pageNumber = getActualPageNumber(doc.pages[i]);
            if (pageNumber === null) continue;
            if (maxNumber === null || pageNumber > maxNumber) {
                maxNumber = pageNumber;
            }
        }

        if (sourceNumber !== null && maxNumber !== null) {
            if (sourceNumber < maxNumber) {
                return String(sourceNumber) + "-" + String(maxNumber);
            }
            return String(sourceNumber);
        }

        return String(sourcePage.name);
    }

    function getActualPageNumber(page) {
        return parseUnsignedInteger(String(page.name));
    }

    function parseUnsignedInteger(text) {
        if (!/^\d+$/.test(String(text))) return null;
        return parseInt(text, 10);
    }

    function getSelectedTextFrame() {
        if (!app.selection || app.selection.length === 0) return null;

        var selected = app.selection[0];
        if (!isValidItem(selected)) return null;

        if (isTextFrame(selected)) return selected;

        try {
            if (
                selected.parentTextFrames &&
                selected.parentTextFrames.length > 0 &&
                isTextFrame(selected.parentTextFrames[0])
            ) {
                return selected.parentTextFrames[0];
            }
        } catch (e1) {}

        try {
            var parent = selected.parent;
            while (parent && isValidItem(parent)) {
                if (isTextFrame(parent)) return parent;
                parent = parent.parent;
            }
        } catch (e2) {}

        return null;
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

    function isValidItem(item) {
        if (!item) return false;

        try {
            if (item.isValid !== undefined && !item.isValid) return false;
        } catch (e1) {
            return false;
        }

        return true;
    }

    function safeContents(textFrame) {
        try {
            return String(textFrame.contents || "");
        } catch (e1) {}

        try {
            if (textFrame.texts && textFrame.texts.length > 0) {
                return String(textFrame.texts[0].contents || "");
            }
        } catch (e2) {}

        return "";
    }

    function getParentPage(item) {
        if (!item) return null;

        try {
            if (item.parentPage && item.parentPage.isValid) return item.parentPage;
        } catch (e1) {}

        try {
            var parent = item.parent;
            while (parent && isValidItem(parent)) {
                if (parent.parentPage && parent.parentPage.isValid) {
                    return parent.parentPage;
                }
                parent = parent.parent;
            }
        } catch (e2) {}

        return null;
    }

    function getSpreadFromPage(page) {
        if (!page) return null;

        try {
            if (page.parent && page.parent.isValid) return page.parent;
        } catch (e1) {}

        try {
            if (page.parent) return page.parent;
        } catch (e2) {}

        return null;
    }

    function isOnSpread(item, spread) {
        var page = getParentPage(item);
        if (!page) return false;

        try {
            for (var i = 0; i < spread.pages.length; i++) {
                if (page === spread.pages[i]) return true;
            }
        } catch (e1) {}

        return false;
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

    function buildFrameKeySet(frames) {
        var keys = {};

        for (var i = 0; i < frames.length; i++) {
            var key = getItemKey(frames[i]);
            if (key !== null) keys[key] = true;
        }

        return keys;
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

    function buildReport(result, foundFrameCount, plannedCount) {
        var report = "完成。\n\n";
        report += "同位置文本框：" + foundFrameCount + " 个\n";
        report += "已填充：" + result.filled + " 个\n";

        if (result.skippedNoDates > 0) {
            report += "因所在跨页无有效日期而跳过：" + result.skippedNoDates + " 个\n";
        }

        if (plannedCount > result.filled) {
            report += "填充失败：" + (plannedCount - result.filled) + " 个\n";
        }

        if (result.failed.length > 0) {
            report += "\n失败详情：\n";
            var limit = Math.min(result.failed.length, 20);
            for (var i = 0; i < limit; i++) {
                report += "- " + result.failed[i] + "\n";
            }
            if (result.failed.length > 20) {
                report += "... 还有 " + (result.failed.length - 20) + " 项未显示\n";
            }
        }

        report += "\n需要撤销时，按一次 Cmd+Z 即可撤销本次全部填充。";
        return report;
    }

    try {
        main();
    } catch (err) {
        var lineText = err.line ? "\n\n行号：" + err.line : "";
        alert("按位置批量填充跨页日期范围失败：\n\n" + err.message + lineText);
    }
})();
