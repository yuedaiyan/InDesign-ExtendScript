/*
  文件: FillSelectedTextFrameWithSpreadDateRange.jsx

  用途:
  - 扫描当前选中文本框所在跨页的日期文本，并把日期范围写入该文本框。

  使用前:
  - 打开要处理的 InDesign 文档。
  - 选中一个要写入结果的文本框。
  - 确认同一跨页中存在有效 YYYY-MM-DD 日期。

  运行流程:
  1. 运行脚本。
  2. 脚本自动收集同跨页日期，忽略选中的目标文本框。
  3. 将最小日期和最大日期写成 min—max。

  注意:
  - 日期会校验真实年月日并去重。
  - 写入动作包装为一次撤销操作。
*/
(function () {
    function main() {
        if (app.documents.length === 0) {
            alert("请先打开一个 InDesign 文档。");
            return;
        }

        var targetFrame = getSelectedTextFrame();
        if (!targetFrame) {
            alert("请先选中一个文本框。");
            return;
        }

        var targetPage = getParentPage(targetFrame);
        if (!targetPage) {
            alert("无法判断所选文本框所在页面，请确认它位于正常文档页面上。");
            return;
        }

        var spread = getSpreadFromPage(targetPage);
        if (!spread) {
            alert("无法判断所选文本框所在跨页。");
            return;
        }

        var dateList = collectDatesFromSpread(spread, targetFrame);
        if (dateList.length === 0) {
            alert("当前跨页没有找到形如 2020-12-31 的有效日期。");
            return;
        }

        dateList.sort();

        var result = dateList[0] + "\u2014" + dateList[dateList.length - 1];

        app.doScript(
            function () {
                targetFrame.contents = "";
                targetFrame.contents = result;
            },
            ScriptLanguage.JAVASCRIPT,
            undefined,
            UndoModes.ENTIRE_SCRIPT,
            "填充当前跨页日期范围"
        );
    }

    function collectDatesFromSpread(spread, targetFrame) {
        var textFrames = collectTextFramesFromSpread(spread);
        var dates = [];
        var seenDates = {};

        for (var i = 0; i < textFrames.length; i++) {
            var textFrame = textFrames[i];
            if (isSamePageItem(textFrame, targetFrame)) continue;

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

    function isSamePageItem(a, b) {
        if (!a || !b) return false;
        if (a === b) return true;

        var aKey = getItemKey(a);
        var bKey = getItemKey(b);

        return aKey !== null && bKey !== null && aKey === bKey;
    }

    function getItemKey(item) {
        try {
            if (item.id !== undefined) return String(item.id);
        } catch (e1) {}

        return null;
    }

    try {
        main();
    } catch (err) {
        var lineText = err.line ? "\n\n行号：" + err.line : "";
        alert("填充当前跨页日期范围失败：\n\n" + err.message + lineText);
    }
})();
