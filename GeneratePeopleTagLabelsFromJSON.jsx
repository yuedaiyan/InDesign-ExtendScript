/*
  GeneratePeopleTagLabelsFromJSON.jsx

  用法：
  1. 打开 InDesign 文档。
  2. 选中一个人物标签模板 Group（组里至少需要有一个文本框架）。
  3. 运行本脚本。
  4. 脚本读取 diary_entries.merged.json 中每条 diary entry 的 people_tags 字段：
     - 用 diary_people_index.json 查找每个人名对应的 label；
     - 同一条 entry 的人物 label 自下而上排列；
     - 不同 entry 从左到右排列；
     - 每个生成标签复制模板，只替换复制组里的文本框文字，不改变文本框底色。
*/

(function () {
    function errorText(error) {
        var parts = [];

        try {
            if (error.message) parts.push(error.message);
        } catch (e1) {}

        try {
            if (error.description) parts.push(error.description);
        } catch (e2) {}

        try {
            if (parts.length === 0) parts.push(String(error));
        } catch (e3) {
            parts.push("未知错误");
        }

        try {
            if (error.number) parts.push("错误编号：" + error.number);
        } catch (e4) {}

        return parts.join("\n");
    }

    function errorLine(error) {
        try {
            if (error.line) return error.line;
        } catch (e1) {}

        try {
            if (error.lineNumber) return error.lineNumber;
        } catch (e2) {}

        return "未知";
    }

    try {
        if (app.documents.length === 0) {
            alert("请先打开一个 InDesign 文档。");
            return;
        }

        var doc = app.activeDocument;

        // ====================================================================
        // 参数区：之后主要改这里
        // ====================================================================

        var ENTRIES_JSON_FILE_NAME = "diary_entries.merged.json";
        var PEOPLE_INDEX_JSON_FILE_NAME = "diary_people_index.json";
        var SCRIPT_FILE = new File($.fileName);
        var ENTRIES_JSON_PATH =
            SCRIPT_FILE.parent.fsName + "/" + ENTRIES_JSON_FILE_NAME;
        var PEOPLE_INDEX_JSON_PATH =
            SCRIPT_FILE.parent.fsName + "/" + PEOPLE_INDEX_JSON_FILE_NAME;

        // true：以当前选中的模板位置作为生成起点，最不容易移出粘贴板。
        // false：使用下面 START_X / START_Y 指定的固定坐标。
        var USE_TEMPLATE_POSITION_AS_START = true;

        // 固定生成起点。只有 USE_TEMPLATE_POSITION_AS_START = false 时才生效。
        // 这里指“每条 entry 最下面一个人物标签”的左上角位置。
        var START_X = 251.920083333333;
        var START_Y = 47.6730000000002;

        // 同一条 diary entry 内，人物标签从下到上排列：每往上一个，y 减少 TAG_Y_GAP。
        var TAG_Y_GAP = 6.776;

        // 不同 diary entry 从左到右排列：每条 entry 往右移动 ENTRY_X_GAP。
        var ENTRY_X_GAP = 14.755;

        // 只生成前多少条。设为 0 或负数表示生成 JSON 里全部条目。
        var MAX_ENTRIES = 24;

        // 调试用：true 时，脚本一开始会弹窗确认自己已经启动。
        // 确认脚本可以正常运行后，可以改回 false。
        var SHOW_START_ALERT = true;

        // true：删除之前由本脚本生成的人物标签；false：保留旧结果继续新增。
        var CLEAR_PREVIOUS_GENERATED = false;

        // true：模板保留在原地；false：生成完成后隐藏模板。
        var KEEP_TEMPLATE_VISIBLE = true;

        // 给生成对象打的默认标签。运行脚本时会弹窗让你手动确认或修改。
        var DEFAULT_GENERATED_LABEL = "generated_json_people_label_";
        var GENERATED_LABEL = DEFAULT_GENERATED_LABEL;

        // ====================================================================
        // 工具函数
        // ====================================================================

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
            return eval("(" + text + ")");
        }

        function extractEntries(data) {
            if (data instanceof Array) return data;
            if (data.entries instanceof Array) return data.entries;
            if (data.data instanceof Array) return data.data;
            if (data.diary_entries instanceof Array) return data.diary_entries;
            throw new Error(
                "JSON 结构无法识别：需要根结构是数组，或包含 entries / data / diary_entries 数组。"
            );
        }

        function extractPeopleIndex(data) {
            if (data instanceof Array) return data;
            if (data.people instanceof Array) return data.people;
            if (data.data instanceof Array) return data.data;
            throw new Error(
                "人物索引 JSON 结构无法识别：需要根结构是数组，或包含 people / data 数组。"
            );
        }

        function getTypeName(item) {
            try {
                if (item.typename) return item.typename;
            } catch (e1) {}

            try {
                if (item.constructor && item.constructor.name) {
                    return item.constructor.name;
                }
            } catch (e) {}

            return "";
        }

        function removeItem(item) {
            try {
                if (isValidItem(item)) item.remove();
            } catch (e) {}
        }

        function isValidItem(item) {
            try {
                return item && item.isValid;
            } catch (e) {
                return false;
            }
        }

        function isTextFrame(item) {
            if (!isValidItem(item)) return;

            try {
                if (getTypeName(item) === "TextFrame") return true;
            } catch (e1) {}

            try {
                if (
                    item.constructor &&
                    String(item.constructor.name) === "TextFrame"
                ) {
                    return true;
                }
            } catch (e2) {}

            return false;
        }

        function addTextFrame(result, seen, item) {
            if (!isTextFrame(item)) return;

            var key = "";
            try {
                key = String(item.id);
            } catch (e1) {}

            if (key === "") {
                try {
                    key = String(item.toSpecifier());
                } catch (e2) {}
            }

            if (key !== "") {
                if (seen[key]) return;
                seen[key] = true;
            }

            result.push(item);
        }

        function collectTextFrames(item, result, seen) {
            if (!isValidItem(item)) return;
            if (isTextFrame(item)) {
                addTextFrame(result, seen, item);
                return;
            }

            // 有些复杂 Group 不会稳定暴露同一种子集合，所以多种入口都尝试。
            try {
                if (item.textFrames && item.textFrames.length > 0) {
                    for (var t = 0; t < item.textFrames.length; t++) {
                        addTextFrame(result, seen, item.textFrames[t]);
                    }
                }
            } catch (e1) {}

            try {
                if (item.allPageItems && item.allPageItems.length > 0) {
                    for (var a = 0; a < item.allPageItems.length; a++) {
                        collectTextFrames(item.allPageItems[a], result, seen);
                    }
                }
            } catch (e2) {}

            try {
                if (item.groups && item.groups.length > 0) {
                    for (var g = 0; g < item.groups.length; g++) {
                        collectTextFrames(item.groups[g], result, seen);
                    }
                }
            } catch (e3) {}

            try {
                if (item.pageItems && item.pageItems.length > 0) {
                    for (var p = 0; p < item.pageItems.length; p++) {
                        collectTextFrames(item.pageItems[p], result, seen);
                    }
                }
            } catch (e4) {}
        }

        function getTextFrames(item) {
            var result = [];
            var seen = {};
            collectTextFrames(item, result, seen);
            return result;
        }

        function getParentGroup(item) {
            try {
                var parent = item.parent;
                while (parent && parent.isValid) {
                    if (getTypeName(parent) === "Group") return parent;
                    parent = parent.parent;
                }
            } catch (e) {}

            return null;
        }

        function getTemplateItem() {
            if (app.selection.length === 0) return null;

            var selected = app.selection[0];
            if (!isValidItem(selected)) return null;

            if (getTypeName(selected) === "Group") return selected;

            var parentGroup = getParentGroup(selected);
            if (parentGroup) return parentGroup;

            return selected;
        }

        function askGeneratedLabel() {
            var value = prompt(
                "请输入本次生成对象要使用的标签。\n\n" +
                    "下次如果开启 CLEAR_PREVIOUS_GENERATED，会按这个标签清理旧对象。",
                DEFAULT_GENERATED_LABEL
            );

            if (value === null) return null;

            value = String(value).replace(/^\s+|\s+$/g, "");
            if (value === "") {
                alert("标签不能为空。脚本已取消。");
                return null;
            }

            return value;
        }

        function askStartEntryId(entries) {
            var defaultId = "";

            if (
                entries.length > 0 &&
                entries[0].id !== undefined &&
                entries[0].id !== null
            ) {
                defaultId = String(entries[0].id);
            }

            var value = prompt(
                "请输入本次开始生成的 JSON 条目 id。\n\n" +
                    "脚本会从匹配到的这个 id 开始，按 JSON 顺序继续往后生成。",
                defaultId
            );

            if (value === null) return null;

            value = String(value).replace(/^\s+|\s+$/g, "");
            if (value === "") {
                alert("开始条目 id 不能为空。脚本已取消。");
                return null;
            }

            return value;
        }

        function findEntryIndexById(entries, idText) {
            for (var i = 0; i < entries.length; i++) {
                try {
                    if (String(entries[i].id) === idText) return i;
                } catch (e) {}
            }

            return -1;
        }

        function moveToTopLeft(item, left, top) {
            var bounds = item.geometricBounds;
            var dx = left - bounds[1];
            var dy = top - bounds[0];
            item.move(undefined, [dx, dy]);
        }

        function setGeneratedLabel(
            item,
            entryIndex,
            entryId,
            personIndex,
            personName,
            personLabel
        ) {
            try {
                item.label =
                    GENERATED_LABEL +
                    "|entry=" +
                    entryIndex +
                    "|id=" +
                    entryId +
                    "|person=" +
                    personIndex +
                    "|name=" +
                    personName +
                    "|label=" +
                    personLabel;
            } catch (e) {}
        }

        function setGeneratedEntryGroupLabel(item, entryIndex, entryId, count) {
            try {
                item.label =
                    GENERATED_LABEL +
                    "|entry_group=" +
                    entryIndex +
                    "|id=" +
                    entryId +
                    "|count=" +
                    count;
            } catch (e) {}
        }

        function groupPageItems(items, entryIndex, entryId) {
            var validItems = [];

            for (var i = 0; i < items.length; i++) {
                if (isValidItem(items[i])) validItems.push(items[i]);
            }

            if (validItems.length === 0) return null;

            if (validItems.length === 1) {
                setGeneratedEntryGroupLabel(
                    validItems[0],
                    entryIndex,
                    entryId,
                    validItems.length
                );
                return validItems[0];
            }

            var group = null;

            try {
                group = doc.groups.add(validItems);
            } catch (e1) {
                try {
                    var parentPage = validItems[0].parentPage;
                    if (parentPage && parentPage.isValid) {
                        group = parentPage.groups.add(validItems);
                    }
                } catch (e2) {}
            }

            if (!group) {
                try {
                    var parent = validItems[0].parent;
                    if (parent && parent.groups) {
                        group = parent.groups.add(validItems);
                    }
                } catch (e3) {}
            }

            if (!group) {
                throw new Error(
                    "第 " +
                        entryIndex +
                        " 条生成完成后自动编组失败。\n\n这一条生成对象数：" +
                        validItems.length
                );
            }

            setGeneratedEntryGroupLabel(group, entryIndex, entryId, validItems.length);
            return group;
        }

        function clearPreviousGenerated() {
            var removed = 0;
            for (var p = 0; p < doc.pages.length; p++) {
                var items;
                try {
                    items = doc.pages[p].pageItems;
                } catch (e1) {
                    continue;
                }

                for (var i = items.length - 1; i >= 0; i--) {
                    var item = items[i];
                    try {
                        if (
                            item.label &&
                            String(item.label).indexOf(GENERATED_LABEL) === 0
                        ) {
                            item.remove();
                            removed++;
                        }
                    } catch (e2) {}
                }
            }
            return removed;
        }

        function normalizeText(value) {
            if (value === null || value === undefined) return "";
            return String(value).replace(/^\s+|\s+$/g, "");
        }

        function normalizePeopleTags(peopleTags) {
            if (!(peopleTags instanceof Array)) return [];

            var result = [];
            for (var i = 0; i < peopleTags.length; i++) {
                var text = normalizeText(peopleTags[i]);
                if (text !== "") result.push(text);
            }
            return result;
        }

        function buildPeopleLabelMap(peopleIndex) {
            var map = {};
            var duplicateNames = [];

            for (var i = 0; i < peopleIndex.length; i++) {
                var person = peopleIndex[i];
                var name = normalizeText(person.original_name);
                var label = normalizeText(person.label);

                if (name === "" || label === "") continue;

                if (map[name] !== undefined && map[name] !== label) {
                    duplicateNames.push(name);
                    continue;
                }

                map[name] = label;
            }

            if (duplicateNames.length > 0) {
                alert(
                    "人物索引里有重复人名且 label 不一致，脚本会使用第一次出现的 label。\n\n" +
                        duplicateNames.slice(0, 20).join("\n")
                );
            }

            return map;
        }

        function setTextFrameContents(textFrames, text) {
            for (var i = 0; i < textFrames.length; i++) {
                try {
                    textFrames[i].contents = text;
                } catch (e) {}
            }
        }

        function addUniqueText(list, seen, text) {
            if (seen[text]) return;
            seen[text] = true;
            list.push(text);
        }

        // ====================================================================
        // 主逻辑
        // ====================================================================

        function main() {
            var inputGeneratedLabel = askGeneratedLabel();
            if (inputGeneratedLabel === null) return;
            GENERATED_LABEL = inputGeneratedLabel;

            var templateItem = getTemplateItem();

            if (!templateItem) {
                alert(
                    "没有选中模板。\n\n" +
                        "请先选中人物标签模板 Group，或选中模板组里的文本框架，再运行脚本。"
                );
                return;
            }

            var templateTextFrames = getTextFrames(templateItem);
            var templateBounds = templateItem.geometricBounds;
            var startX = USE_TEMPLATE_POSITION_AS_START
                ? templateBounds[1]
                : START_X;
            var startY = USE_TEMPLATE_POSITION_AS_START
                ? templateBounds[0]
                : START_Y;

            if (templateTextFrames.length === 0) {
                alert(
                    "选中的模板里找不到文本框。\n\n" +
                        "脚本只会修改复制组中的文本框文字，其他元素会被保留但不会被修改。"
                );
                return;
            }

            var entries;
            var peopleIndex;
            try {
                entries = extractEntries(parseJSON(readFile(ENTRIES_JSON_PATH)));
                peopleIndex = extractPeopleIndex(
                    parseJSON(readFile(PEOPLE_INDEX_JSON_PATH))
                );
            } catch (err) {
                alert("读取 JSON 失败：\n\n" + errorText(err));
                return;
            }

            var peopleLabelMap = buildPeopleLabelMap(peopleIndex);

            var startEntryId = askStartEntryId(entries);
            if (startEntryId === null) return;

            var startEntryIndex = findEntryIndexById(entries, startEntryId);
            if (startEntryIndex < 0) {
                alert(
                    "找不到 id 为 " +
                        startEntryId +
                        " 的 JSON 条目。\n\n请检查 JSON 里的 id 字段后再运行。"
                );
                return;
            }

            entries = entries.slice(startEntryIndex);

            if (MAX_ENTRIES > 0 && entries.length > MAX_ENTRIES) {
                entries = entries.slice(0, MAX_ENTRIES);
            }

            if (SHOW_START_ALERT) {
                alert(
                    "脚本已启动。\n\n" +
                        "日记 JSON 文件：\n" +
                        ENTRIES_JSON_PATH +
                        "\n\n人物索引 JSON 文件：\n" +
                        PEOPLE_INDEX_JSON_PATH +
                        "\n\n将处理条目数：" +
                        entries.length +
                        "\n开始条目 id：" +
                        startEntryId +
                        "\n模板内文本框数：" +
                        templateTextFrames.length +
                        "\n\n生成起点：x=" +
                        startX.toFixed(2) +
                        ", y=" +
                        startY.toFixed(2) +
                        "\n\n生成对象标签：" +
                        GENERATED_LABEL +
                        "\n\n如果点击确定后没有生成，请把下一个报错弹窗发给我。"
                );
            }

            var removedCount = 0;
            if (CLEAR_PREVIOUS_GENERATED) {
                removedCount = clearPreviousGenerated();
            }

            var generatedCount = 0;
            var entryGroupCount = 0;
            var placeholderCount = 0;
            var unknownPeople = [];
            var unknownPeopleSeen = {};

            for (
                var entryIndex = 0;
                entryIndex < entries.length;
                entryIndex++
            ) {
                var peopleTags = normalizePeopleTags(
                    entries[entryIndex].people_tags
                );
                var entryId = entries[entryIndex].id;
                var entryGeneratedItems = [];

                if (peopleTags.length === 0) {
                    var placeholderItem = templateItem.duplicate();
                    var placeholderTextFrames = getTextFrames(placeholderItem);

                    if (placeholderTextFrames.length === 0) {
                        removeItem(placeholderItem);
                        throw new Error(
                            "复制第 " +
                                (entryIndex + 1) +
                                " 条空人物标签占位后，找不到可填充文字的文本框。"
                        );
                    }

                    setTextFrameContents(placeholderTextFrames, "");
                    setGeneratedLabel(
                        placeholderItem,
                        entryIndex + 1,
                        entryId,
                        0,
                        "",
                        ""
                    );

                    try {
                        moveToTopLeft(
                            placeholderItem,
                            startX + entryIndex * ENTRY_X_GAP,
                            startY
                        );
                    } catch (placeholderMoveError) {
                        removeItem(placeholderItem);
                        throw new Error(
                            "移动第 " +
                                (entryIndex + 1) +
                                " 条空人物标签占位失败。\n\n目标位置：x=" +
                                (startX + entryIndex * ENTRY_X_GAP).toFixed(2) +
                                ", y=" +
                                startY.toFixed(2) +
                                "\n\nInDesign 原始错误：\n" +
                                placeholderMoveError.message
                        );
                    }

                    generatedCount++;
                    placeholderCount++;
                    entryGeneratedItems.push(placeholderItem);
                    groupPageItems(entryGeneratedItems, entryIndex + 1, entryId);
                    entryGroupCount++;
                    continue;
                }

                var visiblePersonIndex = 0;
                for (
                    var personIndex = 0;
                    personIndex < peopleTags.length;
                    personIndex++
                ) {
                    var personName = peopleTags[personIndex];
                    var personLabel = peopleLabelMap[personName];

                    if (personLabel === undefined) {
                        addUniqueText(unknownPeople, unknownPeopleSeen, personName);
                        continue;
                    }

                    var duplicateItem = templateItem.duplicate();
                    var duplicateTextFrames = getTextFrames(duplicateItem);

                    if (duplicateTextFrames.length === 0) {
                        removeItem(duplicateItem);
                        throw new Error(
                            "复制第 " +
                                (entryIndex + 1) +
                                " 条、第 " +
                                (personIndex + 1) +
                                " 个人物标签后，找不到可填充文字的文本框。"
                        );
                    }

                    setTextFrameContents(duplicateTextFrames, personLabel);
                    setGeneratedLabel(
                        duplicateItem,
                        entryIndex + 1,
                        entryId,
                        personIndex + 1,
                        personName,
                        personLabel
                    );

                    try {
                        moveToTopLeft(
                            duplicateItem,
                            startX + entryIndex * ENTRY_X_GAP,
                            startY - visiblePersonIndex * TAG_Y_GAP
                        );
                    } catch (moveError) {
                        removeItem(duplicateItem);
                        throw new Error(
                            "移动第 " +
                                (entryIndex + 1) +
                                " 条、第 " +
                                (personIndex + 1) +
                                " 个人物标签失败。\n\n目标位置：x=" +
                                (startX + entryIndex * ENTRY_X_GAP).toFixed(2) +
                                ", y=" +
                                (startY - visiblePersonIndex * TAG_Y_GAP).toFixed(
                                    2
                                ) +
                                "\n\nInDesign 原始错误：\n" +
                                moveError.message
                        );
                    }

                    generatedCount++;
                    visiblePersonIndex++;
                    entryGeneratedItems.push(duplicateItem);
                }

                if (entryGeneratedItems.length > 0) {
                    groupPageItems(entryGeneratedItems, entryIndex + 1, entryId);
                    entryGroupCount++;
                }
            }

            if (!KEEP_TEMPLATE_VISIBLE) {
                try {
                    templateItem.visible = false;
                } catch (e) {}
            }

            var unknownMessage = "";
            if (unknownPeople.length > 0) {
                unknownMessage =
                    "\n未在人物索引中找到的人名数：" +
                    unknownPeople.length +
                    "\n未找到的人名示例：\n" +
                    unknownPeople.slice(0, 20).join("\n");
            }

            alert(
                "人物标签生成完成。\n\n" +
                    "JSON 条目数：" +
                    entries.length +
                    "\n生成人物标签数：" +
                    generatedCount +
                    "\n生成 entry 组数：" +
                    entryGroupCount +
                    "\n空 people_tags 占位数：" +
                    placeholderCount +
                    "\n开始条目 id：" +
                    startEntryId +
                    "\n清理旧标签数：" +
                    removedCount +
                    "\n使用标签：" +
                    GENERATED_LABEL +
                    unknownMessage +
                    "\n\n如果位置不合适，请调整脚本顶部的 START_X / START_Y / TAG_Y_GAP / ENTRY_X_GAP。"
            );
        }

        app.doScript(
            main,
            ScriptLanguage.JAVASCRIPT,
            undefined,
            UndoModes.ENTIRE_SCRIPT,
            "根据 JSON people_tags 生成人物编号标签"
        );
    } catch (error) {
        alert(
            "脚本执行失败：\n\n" +
                errorText(error) +
                "\n\n行号：" +
                errorLine(error)
        );
    }
})();
