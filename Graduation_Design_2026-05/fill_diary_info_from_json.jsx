/*
  文件: fill_diary_info_from_json.jsx

  用途:
  - 扫描文档中内容像日期的文本框，并用日记 JSON 中的 date / location / time_of_day 替换文本框内容。

  使用前:
  - 打开毕业设计 InDesign 文档。
  - 确认 JSON_PATH 指向的 /Users/yuedaiyan/code_school/biue_All/diary_entries.json 存在，或先修改脚本顶部路径。
  - 确认待处理文本框内容形如 YYYY-MM-DD 或 YYYY-MM-DD_N。

  运行流程:
  1. 运行脚本。
  2. 脚本遍历文档页面和组内文本框。
  3. 按日期和可选序号匹配日记条目，并写入配置模板中的字段。

  注意:
  - 这是较早的固定路径脚本；如果 JSON 已迁移，先修改 JSON_PATH。
  - 默认找不到匹配项时保留原文本。
*/
function main() {
    if (app.documents.length === 0) {
        alert("请先打开一个 InDesign 文档。");
        return;
    }

    var doc = app.activeDocument;

    // =========================
    // 参数区
    // =========================

    var JSON_PATH = "/Users/yuedaiyan/code_school/biue_All/diary_entries.json";

    // 写入文本框的格式
    // 可选字段：{date} {location} {time_of_day}
    var OUTPUT_TEMPLATE = "{date}\r{location}\r{time_of_day}";

    // 是否只处理看起来像日期的文本框
    var ONLY_PROCESS_DATE_TEXT = true;

    // 是否在找不到匹配项时保留原文本
    var KEEP_ORIGINAL_IF_NOT_FOUND = true;

    // =========================
    // 工具函数
    // =========================

    function trim(str) {
        return String(str).replace(/^\s+|\s+$/g, "");
    }

    function normalizeText(str) {
        return trim(String(str).replace(/\r/g, "\n"));
    }

    function readFile(path) {
        var file = new File(path);

        if (!file.exists) {
            throw new Error("找不到 JSON 文件：\n" + path);
        }

        file.encoding = "UTF-8";

        if (!file.open("r")) {
            throw new Error("无法打开 JSON 文件：\n" + path);
        }

        var text = file.read();
        file.close();

        return text;
    }

    function parseJSON(text) {
        if (typeof JSON !== "undefined" && JSON.parse) {
            return JSON.parse(text);
        }

        // 兼容较老版本 ExtendScript
        return eval("(" + text + ")");
    }

    function extractEntries(jsonData) {
        // 情况 1：根本身就是数组
        if (jsonData instanceof Array) {
            return jsonData;
        }

        // 情况 2：常见包装结构
        if (jsonData.entries && jsonData.entries instanceof Array) {
            return jsonData.entries;
        }

        if (jsonData.data && jsonData.data instanceof Array) {
            return jsonData.data;
        }

        if (jsonData.diary_entries && jsonData.diary_entries instanceof Array) {
            return jsonData.diary_entries;
        }

        throw new Error(
            "JSON 结构无法识别。\n" +
                "脚本需要 JSON 根结构是数组，或者包含 entries / data / diary_entries 数组。",
        );
    }

    function buildDateIndex(entries) {
        var index = {};

        for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];

            if (!entry.date) {
                continue;
            }

            var date = String(entry.date);

            if (!index[date]) {
                index[date] = [];
            }

            index[date].push(entry);
        }

        return index;
    }

    function parseDateToken(text) {
        text = normalizeText(text);

        // 只取第一行，避免文本框里已经有多行内容时误判
        var firstLine = trim(text.split("\n")[0]);

        /*
            支持：
            2026-01-30
            2026-01-30_2
            2026-01-30 2
            2026-01-30-2
        */
        var match = firstLine.match(/^(\d{4}-\d{2}-\d{2})(?:[_\-\s]+(\d+))?$/);

        if (!match) {
            return null;
        }

        return {
            raw: firstLine,
            date: match[1],
            number: match[2] ? parseInt(match[2], 10) : null,
        };
    }

    function formatOutput(entry) {
        var result = OUTPUT_TEMPLATE;

        result = result.replace(/\{date\}/g, entry.date || "");
        result = result.replace(/\{location\}/g, entry.location || "");
        result = result.replace(/\{time_of_day\}/g, entry.time_of_day || "");

        return result;
    }

    function getPageIndexOfTextFrame(tf) {
        try {
            if (tf.parentPage && tf.parentPage.isValid) {
                return tf.parentPage.documentOffset;
            }
        } catch (e) {}

        try {
            var p = tf.parent;
            while (p && p.isValid) {
                if (p.constructor && String(p.constructor.name) === "Page") {
                    return p.documentOffset;
                }
                if (p.parentPage && p.parentPage.isValid) {
                    return p.parentPage.documentOffset;
                }
                p = p.parent;
            }
        } catch (e2) {}

        return 999999;
    }

    function getBounds(tf) {
        try {
            return tf.geometricBounds;
        } catch (e) {
            return [0, 0, 0, 0];
        }
    }

    function collectTextFramesFromPageItem(item, result) {
        if (!item || !item.isValid) {
            return;
        }

        try {
            if (
                item.constructor &&
                String(item.constructor.name) === "TextFrame"
            ) {
                result.push(item);
                return;
            }
        } catch (e1) {}

        try {
            if (item.textFrames && item.textFrames.length > 0) {
                for (var i = 0; i < item.textFrames.length; i++) {
                    result.push(item.textFrames[i]);
                }
            }
        } catch (e2) {}

        try {
            if (item.groups && item.groups.length > 0) {
                for (var g = 0; g < item.groups.length; g++) {
                    collectTextFramesFromPageItem(item.groups[g], result);
                }
            }
        } catch (e3) {}

        try {
            if (item.pageItems && item.pageItems.length > 0) {
                for (var p = 0; p < item.pageItems.length; p++) {
                    collectTextFramesFromPageItem(item.pageItems[p], result);
                }
            }
        } catch (e4) {}
    }

    function sortTextFramesByPageAndPosition(a, b) {
        var pageA = getPageIndexOfTextFrame(a);
        var pageB = getPageIndexOfTextFrame(b);

        if (pageA !== pageB) {
            return pageA - pageB;
        }

        var ba = getBounds(a);
        var bb = getBounds(b);

        var topA = ba[0];
        var leftA = ba[1];

        var topB = bb[0];
        var leftB = bb[1];

        // 同一页：先按纵向，再按横向
        if (Math.abs(topA - topB) > 1) {
            return topA - topB;
        }

        return leftA - leftB;
    }

    // =========================
    // 主逻辑
    // =========================

    var jsonText;
    var jsonData;
    var entries;
    var dateIndex;

    try {
        jsonText = readFile(JSON_PATH);
        jsonData = parseJSON(jsonText);
        entries = extractEntries(jsonData);
        dateIndex = buildDateIndex(entries);
    } catch (err) {
        alert("读取 JSON 失败：\n\n" + err.message);
        return;
    }

    var textFrames = [];

    // 注意：页面上的对象是“组”，日期文本框在组里面。
    // 所以不能只用 doc.textFrames，而是逐页进入 pageItems / groups 递归收集组内文本框。
    for (var pageIndex = 0; pageIndex < doc.pages.length; pageIndex++) {
        var page = doc.pages[pageIndex];

        for (
            var itemIndex = 0;
            itemIndex < page.pageItems.length;
            itemIndex++
        ) {
            collectTextFramesFromPageItem(
                page.pageItems[itemIndex],
                textFrames,
            );
        }
    }

    textFrames.sort(sortTextFramesByPageAndPosition);

    /*
        自动计数器：

        如果文本框是：
        2026-01-30

        并且 JSON 里有多个 2026-01-30，
        那么第一次遇到 2026-01-30 用第 1 个，
        第二次遇到 2026-01-30 用第 2 个。

        如果文本框明确写了：
        2026-01-30_2

        那么直接使用第 2 个。
    */
    var usedCounter = {};

    var changedCount = 0;
    var skippedCount = 0;
    var notFoundMessages = [];

    for (var t = 0; t < textFrames.length; t++) {
        var tf = textFrames[t];

        if (!tf.isValid) {
            continue;
        }

        var originalText = "";

        try {
            originalText = tf.contents;
        } catch (e1) {
            skippedCount++;
            continue;
        }

        var parsed = parseDateToken(originalText);

        if (!parsed) {
            if (ONLY_PROCESS_DATE_TEXT) {
                skippedCount++;
                continue;
            } else {
                skippedCount++;
                continue;
            }
        }

        var date = parsed.date;

        if (!dateIndex[date]) {
            notFoundMessages.push("找不到日期：" + parsed.raw);
            if (!KEEP_ORIGINAL_IF_NOT_FOUND) {
                tf.contents = "";
            }
            continue;
        }

        var targetNumber;

        if (parsed.number !== null) {
            // 2026-01-30_2 => 第二个
            targetNumber = parsed.number;
        } else {
            // 没有编号时，按照文档中遇到的顺序自动匹配
            if (!usedCounter[date]) {
                usedCounter[date] = 0;
            }

            usedCounter[date]++;
            targetNumber = usedCounter[date];
        }

        var entryArray = dateIndex[date];

        if (targetNumber < 1 || targetNumber > entryArray.length) {
            notFoundMessages.push(
                "日期存在，但编号超出范围：" +
                    parsed.raw +
                    "\nJSON 中只有 " +
                    entryArray.length +
                    " 条 " +
                    date,
            );

            if (!KEEP_ORIGINAL_IF_NOT_FOUND) {
                tf.contents = "";
            }

            continue;
        }

        var entry = entryArray[targetNumber - 1];

        try {
            tf.contents = formatOutput(entry);
            changedCount++;
        } catch (e2) {
            notFoundMessages.push(
                "写入失败：" + parsed.raw + "\n" + e2.message,
            );
        }
    }

    var msg = "";
    msg += "处理完成。\n\n";
    msg += "成功写入文本框数量：" + changedCount + "\n";
    msg += "跳过文本框数量：" + skippedCount + "\n";

    if (notFoundMessages.length > 0) {
        msg += "\n以下项目没有成功匹配：\n\n";
        msg += notFoundMessages.slice(0, 20).join("\n\n");

        if (notFoundMessages.length > 20) {
            msg +=
                "\n\n……还有 " + (notFoundMessages.length - 20) + " 条未显示。";
        }
    }

    alert(msg);
}

app.doScript(
    main,
    ScriptLanguage.JAVASCRIPT,
    undefined,
    UndoModes.ENTIRE_SCRIPT,
    "填充日记信息",
);
