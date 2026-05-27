/*
  文件: GenerateTagLabelsFromJSON.jsx

  用途:
  - 根据 diary_entries.merged.json 的 tags 字段生成事件/情绪标签。
  - 脚本复制标签模板，替换文本，并按 tag 色表设置文本框背景色。

  使用前:
  - 打开毕业设计 InDesign 文档。
  - 选中一个标签模板 Group，组内需要有文本框。
  - 确认同目录存在 diary_entries.merged.json。

  运行流程:
  1. 运行脚本。
  2. 输入生成对象标签和起始 JSON id。
  3. 脚本从该条 entry 开始生成标签，并将同一 entry 的标签编组。

  注意:
  - 同一 entry 的 tags 自下而上排列，不同 entry 从左到右排列。
  - 脚本会自动创建或复用 tag_bg_* 色板。
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

        var JSON_FILE_NAME = "diary_entries.merged.json";
        var SCRIPT_FILE = new File($.fileName);
        var JSON_PATH = SCRIPT_FILE.parent.fsName + "/" + JSON_FILE_NAME;

        // true：以当前选中的模板位置作为生成起点，最不容易移出粘贴板。
        // false：使用下面 START_X / START_Y 指定的固定坐标。
        var USE_TEMPLATE_POSITION_AS_START = true;

        // 固定生成起点。只有 USE_TEMPLATE_POSITION_AS_START = false 时才生效。
        // 这里指“每条 entry 最下面一个标签”的左上角位置。
        var START_X = 251.920083333333;
        var START_Y = 47.6730000000002;

        // 同一条 diary entry 内，标签从下到上排列：每往上一个，y 减少 TAG_Y_GAP。
        var TAG_Y_GAP = 6.776;

        // 不同 diary entry 从左到右排列：每条 entry 往右移动 ENTRY_X_GAP。
        var ENTRY_X_GAP = 14.755;

        // 前 12 条保持原间距；第 13 条开始整体向右额外移动这个距离。
        var EXTRA_GAP_AFTER_ENTRY_COUNT = 12;
        var EXTRA_GAP_AFTER_ENTRY_12 = 19.089;

        // 只生成前多少条。设为 0 或负数表示生成 JSON 里全部条目。
        var MAX_ENTRIES = 24;

        // 调试用：true 时，脚本一开始会弹窗确认自己已经启动。
        // 确认脚本可以正常运行后，可以改回 false。
        var SHOW_START_ALERT = true;

        // true：删除之前由本脚本生成的标签；false：保留旧结果继续新增。
        var CLEAR_PREVIOUS_GENERATED = false;

        // true：模板保留在原地；false：生成完成后隐藏模板。
        var KEEP_TEMPLATE_VISIBLE = true;

        // true：所有 entry 组生成完成后，统一按选区顶部向上对齐。
        var ALIGN_ENTRY_GROUPS_TO_TOP = true;

        // true：向上对齐后，把本次生成的所有 entry 组编成一个大组。
        var GROUP_ALL_GENERATED_ENTRIES = true;

        // 大组最终左上角位置。
        var MASTER_GROUP_LEFT = 5.935;
        var MASTER_GROUP_TOP = 8.342;

        // 给生成对象打的默认标签。运行脚本时会弹窗让你手动确认或修改。
        var DEFAULT_GENERATED_LABEL = "generated_json_tag_label_";
        var GENERATED_LABEL = DEFAULT_GENERATED_LABEL;

        // tag 对应的文本框背景色。数组是 RGB。
        var TAG_COLOR_MAP = {
            a1: [246, 169, 174],
            a2: [238, 135, 145],
            a3: [226, 103, 118],
            a4: [207, 78, 96],
            b1: [248, 187, 122],
            b2: [239, 158, 91],
            b3: [224, 132, 72],
            b4: [202, 106, 58],
            c1: [244, 215, 118],
            c2: [230, 195, 87],
            c3: [211, 172, 63],
            c4: [188, 146, 48],
            d1: [166, 209, 139],
            d2: [135, 189, 118],
            d3: [105, 164, 98],
            d4: [79, 139, 83],
            e1: [132, 204, 196],
            e2: [101, 181, 180],
            e3: [77, 154, 166],
            e4: [62, 127, 148],
            f1: [143, 173, 222],
            f2: [121, 144, 208],
            f3: [105, 116, 190],
            f4: [91, 91, 164],
            g1: [191, 183, 207],
            g2: [164, 153, 187],
            g3: [137, 124, 164],
            g4: [113, 99, 141],
        };

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
                "JSON 结构无法识别：需要根结构是数组，或包含 entries / data / diary_entries 数组。",
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

        function findTextFrame(item) {
            if (!isValidItem(item)) return null;
            if (getTypeName(item) === "TextFrame") return item;

            try {
                if (item.textFrames && item.textFrames.length > 0) {
                    return item.textFrames[0];
                }
            } catch (e1) {}

            try {
                for (var i = 0; i < item.pageItems.length; i++) {
                    var found = findTextFrame(item.pageItems[i]);
                    if (found) return found;
                }
            } catch (e2) {}

            return null;
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
                DEFAULT_GENERATED_LABEL,
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
                defaultId,
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

        function getOrCreateRgbColor(name, rgb) {
            var colorName =
                "tag_bg_" + name + "_" + rgb[0] + "_" + rgb[1] + "_" + rgb[2];
            var color = doc.colors.itemByName(colorName);

            try {
                color.name;
                return color;
            } catch (e1) {}

            return doc.colors.add({
                name: colorName,
                model: ColorModel.PROCESS,
                space: ColorSpace.RGB,
                colorValue: rgb,
            });
        }

        function hashText(text) {
            var hash = 0;
            for (var i = 0; i < text.length; i++) {
                hash = (hash * 31 + text.charCodeAt(i)) % 9973;
            }
            return hash;
        }

        function fallbackRgbForTag(tagText) {
            var hash = hashText(tagText);
            return [
                160 + (hash % 60),
                160 + ((hash * 7) % 60),
                160 + ((hash * 13) % 60),
            ];
        }

        function rgbForTag(tagText) {
            if (TAG_COLOR_MAP[tagText]) return TAG_COLOR_MAP[tagText];
            return fallbackRgbForTag(tagText);
        }

        function colorNameForTag(tagText) {
            return String(tagText).replace(/[^A-Za-z0-9_]+/g, "_");
        }

        function applyTagBackground(textFrame, tagText) {
            var rgb = rgbForTag(tagText);
            var color = getOrCreateRgbColor(colorNameForTag(tagText), rgb);
            textFrame.fillColor = color;
            try {
                textFrame.fillTint = 100;
            } catch (e) {}
        }

        function moveToTopLeft(item, left, top) {
            var bounds = item.geometricBounds;
            var dx = left - bounds[1];
            var dy = top - bounds[0];
            item.move(undefined, [dx, dy]);
        }

        function entryXForIndex(startX, entryIndex) {
            var x = startX + entryIndex * ENTRY_X_GAP;

            if (entryIndex >= EXTRA_GAP_AFTER_ENTRY_COUNT) {
                x += EXTRA_GAP_AFTER_ENTRY_12;
            }

            return x;
        }

        function setGeneratedLabel(
            item,
            entryIndex,
            entryId,
            tagIndex,
            tagText,
        ) {
            try {
                item.label =
                    GENERATED_LABEL +
                    "|entry=" +
                    entryIndex +
                    "|id=" +
                    entryId +
                    "|tag=" +
                    tagIndex +
                    "|text=" +
                    tagText;
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

        function setGeneratedMasterGroupLabel(item, count) {
            try {
                item.label = GENERATED_LABEL + "|master_group=1|count=" + count;
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
                    validItems.length,
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
                        validItems.length,
                );
            }

            setGeneratedEntryGroupLabel(
                group,
                entryIndex,
                entryId,
                validItems.length,
            );
            return group;
        }

        function alignItemsToTop(items) {
            var validItems = [];
            var top = null;

            for (var i = 0; i < items.length; i++) {
                if (!isValidItem(items[i])) continue;

                try {
                    var bounds = items[i].geometricBounds;
                    validItems.push(items[i]);

                    if (top === null || bounds[0] < top) {
                        top = bounds[0];
                    }
                } catch (e1) {}
            }

            if (validItems.length < 2 || top === null) return validItems.length;

            for (var j = 0; j < validItems.length; j++) {
                try {
                    var itemBounds = validItems[j].geometricBounds;
                    validItems[j].move(undefined, [0, top - itemBounds[0]]);
                } catch (e2) {
                    throw new Error(
                        "统一向上对齐第 " +
                            (j + 1) +
                            " 个 entry 组失败。\n\nInDesign 原始错误：\n" +
                            e2.message,
                    );
                }
            }

            try {
                app.select(validItems);
            } catch (e3) {}

            return validItems.length;
        }

        function groupAllGeneratedEntries(items) {
            var validItems = [];

            for (var i = 0; i < items.length; i++) {
                if (isValidItem(items[i])) validItems.push(items[i]);
            }

            if (validItems.length === 0) return null;

            if (validItems.length === 1) {
                setGeneratedMasterGroupLabel(validItems[0], validItems.length);
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
                    "本次生成对象的大组编组失败。\n\n待编组 entry 组数：" +
                        validItems.length,
                );
            }

            setGeneratedMasterGroupLabel(group, validItems.length);
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

        function normalizeTags(tags) {
            if (!(tags instanceof Array)) return [];

            var result = [];
            for (var i = 0; i < tags.length; i++) {
                if (tags[i] === null || tags[i] === undefined) continue;
                var text = String(tags[i]).replace(/^\s+|\s+$/g, "");
                if (text !== "") result.push(text);
            }
            return result;
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
                        "请先选中标签模板 Group，或选中模板组里的文本框架，再运行脚本。",
                );
                return;
            }

            var templateTextFrame = findTextFrame(templateItem);
            var templateBounds = templateItem.geometricBounds;
            var startX = USE_TEMPLATE_POSITION_AS_START
                ? templateBounds[1]
                : START_X;
            var startY = USE_TEMPLATE_POSITION_AS_START
                ? templateBounds[0]
                : START_Y;

            if (!templateTextFrame) {
                alert(
                    "选中的模板里找不到文本框。\n\n" +
                        "脚本需要找到一个文本框架，用来替换 tags 文字。",
                );
                return;
            }

            var entries;
            try {
                entries = extractEntries(parseJSON(readFile(JSON_PATH)));
            } catch (err) {
                alert("读取 JSON 失败：\n\n" + errorText(err));
                return;
            }

            var startEntryId = askStartEntryId(entries);
            if (startEntryId === null) return;

            var startEntryIndex = findEntryIndexById(entries, startEntryId);
            if (startEntryIndex < 0) {
                alert(
                    "找不到 id 为 " +
                        startEntryId +
                        " 的 JSON 条目。\n\n请检查 JSON 里的 id 字段后再运行。",
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
                        "JSON 文件：\n" +
                        JSON_PATH +
                        "\n\n将处理条目数：" +
                        entries.length +
                        "\n开始条目 id：" +
                        startEntryId +
                        "\n\n生成起点：x=" +
                        startX.toFixed(2) +
                        ", y=" +
                        startY.toFixed(2) +
                        "\n\n生成对象标签：" +
                        GENERATED_LABEL +
                        "\n\n如果点击确定后没有生成，请把下一个报错弹窗发给我。",
                );
            }

            var removedCount = 0;
            if (CLEAR_PREVIOUS_GENERATED) {
                removedCount = clearPreviousGenerated();
            }

            var generatedCount = 0;
            var entryGroupCount = 0;
            var skippedEntries = 0;
            var generatedEntryGroups = [];
            var alignedEntryGroupCount = 0;
            var masterGroup = null;

            for (
                var entryIndex = 0;
                entryIndex < entries.length;
                entryIndex++
            ) {
                var tags = normalizeTags(entries[entryIndex].tags);
                var entryId = entries[entryIndex].id;
                var entryGeneratedItems = [];

                if (tags.length === 0) {
                    skippedEntries++;
                    continue;
                }

                for (var tagIndex = 0; tagIndex < tags.length; tagIndex++) {
                    var tagText = tags[tagIndex];
                    var duplicateItem = templateItem.duplicate();
                    var duplicateTextFrame = findTextFrame(duplicateItem);
                    var entryX = entryXForIndex(startX, entryIndex);

                    if (!duplicateTextFrame) {
                        removeItem(duplicateItem);
                        throw new Error(
                            "复制第 " +
                                (entryIndex + 1) +
                                " 条、第 " +
                                (tagIndex + 1) +
                                " 个标签后，找不到可填充文字的文本框。",
                        );
                    }

                    duplicateTextFrame.contents = tagText;
                    applyTagBackground(duplicateTextFrame, tagText);
                    setGeneratedLabel(
                        duplicateItem,
                        entryIndex + 1,
                        entryId,
                        tagIndex + 1,
                        tagText,
                    );

                    try {
                        moveToTopLeft(
                            duplicateItem,
                            entryX,
                            startY - tagIndex * TAG_Y_GAP,
                        );
                    } catch (moveError) {
                        removeItem(duplicateItem);
                        throw new Error(
                            "移动第 " +
                                (entryIndex + 1) +
                                " 条、第 " +
                                (tagIndex + 1) +
                                " 个标签失败。\n\n目标位置：x=" +
                                entryX.toFixed(2) +
                                ", y=" +
                                (startY - tagIndex * TAG_Y_GAP).toFixed(2) +
                                "\n\nInDesign 原始错误：\n" +
                                moveError.message,
                        );
                    }

                    generatedCount++;
                    entryGeneratedItems.push(duplicateItem);
                }

                if (entryGeneratedItems.length > 0) {
                    var entryGroup = groupPageItems(
                        entryGeneratedItems,
                        entryIndex + 1,
                        entryId,
                    );
                    if (entryGroup) generatedEntryGroups.push(entryGroup);
                    entryGroupCount++;
                }
            }

            if (ALIGN_ENTRY_GROUPS_TO_TOP) {
                alignedEntryGroupCount = alignItemsToTop(generatedEntryGroups);
            }

            if (GROUP_ALL_GENERATED_ENTRIES) {
                masterGroup = groupAllGeneratedEntries(generatedEntryGroups);

                if (masterGroup) {
                    moveToTopLeft(
                        masterGroup,
                        MASTER_GROUP_LEFT,
                        MASTER_GROUP_TOP,
                    );

                    try {
                        app.select(masterGroup);
                    } catch (e) {}
                }
            }

            if (!KEEP_TEMPLATE_VISIBLE) {
                try {
                    templateItem.visible = false;
                } catch (e) {}
            }

            alert(
                "标签生成完成。\n\n" +
                    "JSON 条目数：" +
                    entries.length +
                    "\n生成标签数：" +
                    generatedCount +
                    "\n生成 entry 组数：" +
                    entryGroupCount +
                    "\n向上对齐 entry 组数：" +
                    alignedEntryGroupCount +
                    "\n已生成大组：" +
                    (masterGroup ? "是" : "否") +
                    "\n无 tags / 空 tags 条目：" +
                    skippedEntries +
                    "\n开始条目 id：" +
                    startEntryId +
                    "\n清理旧标签数：" +
                    removedCount +
                    "\n使用标签：" +
                    GENERATED_LABEL +
                    "\n\n如果位置不合适，请调整脚本顶部的 START_X / START_Y / TAG_Y_GAP / ENTRY_X_GAP / MASTER_GROUP_LEFT / MASTER_GROUP_TOP。",
            );
        }

        app.doScript(
            main,
            ScriptLanguage.JAVASCRIPT,
            undefined,
            UndoModes.ENTIRE_SCRIPT,
            "根据 JSON tags 生成标签",
        );
    } catch (error) {
        alert(
            "脚本执行失败：\n\n" +
                errorText(error) +
                "\n\n行号：" +
                errorLine(error),
        );
    }
})();
