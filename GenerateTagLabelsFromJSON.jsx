/*
  GenerateTagLabelsFromJSON.jsx

  用法：
  1. 打开 InDesign 文档。
  2. 选中一个标签模板 Group（里面需要有 1 个文本框 + 1 个 Oval/图形底色）。
  3. 运行本脚本。
  4. 脚本读取 JSON 中每条 diary entry 的 tags 字段：
     - 同一条 entry 的 tags 自下而上排列；
     - 不同 entry 从左到右排列；
     - 每个生成标签替换模板文字，并换成新的颜色。
*/

#target "InDesign"

(function () {
    if (app.documents.length === 0) {
        alert("请先打开一个 InDesign 文档。");
        return;
    }

    var doc = app.activeDocument;

    // ====================================================================
    // 参数区：之后主要改这里
    // ====================================================================

    var JSON_PATH =
        "/Users/yuedaiyan/code_school/InDesign_script/diary_entries.merged_sample_50.json";

    // 如果没有选中模板 Group，脚本会尝试用这个 id 找模板。
    // 这个 id 来自你导出的标签属性；如果以后重新做模板，id 可能会变。
    var TEMPLATE_GROUP_ID = 277789;

    // 生成区域的起点。这里指“每条 entry 最下面一个标签”的左上角位置。
    // InDesign 坐标通常是 [y, x]；这里为了好调，单独写成 x / y。
    var START_X = 251.920083333333;
    var START_Y = 180;

    // 同一条 diary entry 内，标签从下到上排列：每往上一个，y 减少 TAG_Y_GAP。
    var TAG_Y_GAP = 10;

    // 不同 diary entry 从左到右排列：每条 entry 往右移动 ENTRY_X_GAP。
    var ENTRY_X_GAP = 10;

    // 只生成前多少条。设为 0 或负数表示生成 JSON 里全部条目。
    var MAX_ENTRIES = 50;

    // true：删除之前由本脚本生成的标签；false：保留旧结果继续新增。
    var CLEAR_PREVIOUS_GENERATED = true;

    // true：模板保留在原地；false：生成完成后隐藏模板。
    var KEEP_TEMPLATE_VISIBLE = true;

    // 给生成对象打的标签，用来下次清理。
    var GENERATED_LABEL = "generated_json_tag_label";

    // 标签底色调色板。脚本会按标签出现顺序循环使用。
    var PALETTE = [
        [255, 166, 87],
        [118, 190, 181],
        [116, 151, 203],
        [236, 125, 134],
        [190, 164, 221],
        [242, 203, 91],
        [129, 183, 105],
        [229, 143, 104],
        [92, 171, 209],
        [201, 121, 166],
        [155, 181, 90],
        [145, 137, 205]
    ];

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

    function getTypeName(item) {
        try {
            return item.constructor.name;
        } catch (e) {
            return "";
        }
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

    function findFillShape(item) {
        if (!isValidItem(item)) return null;

        var typeName = getTypeName(item);
        if (
            typeName === "Oval" ||
            typeName === "Rectangle" ||
            typeName === "Polygon"
        ) {
            try {
                if (typeName !== "TextFrame") return item;
            } catch (e1) {}
        }

        try {
            for (var i = 0; i < item.pageItems.length; i++) {
                var child = item.pageItems[i];
                if (getTypeName(child) === "Oval") return child;
            }
            for (var j = 0; j < item.pageItems.length; j++) {
                var found = findFillShape(item.pageItems[j]);
                if (found) return found;
            }
        } catch (e2) {}

        return null;
    }

    function findPageItemById(container, id) {
        try {
            if (container.id === id) return container;
        } catch (e0) {}

        try {
            for (var i = 0; i < container.pageItems.length; i++) {
                var item = container.pageItems[i];
                try {
                    if (item.id === id) return item;
                } catch (e1) {}
                var found = findPageItemById(item, id);
                if (found) return found;
            }
        } catch (e2) {}

        return null;
    }

    function getTemplateGroup() {
        if (app.selection.length > 0) {
            for (var i = 0; i < app.selection.length; i++) {
                if (getTypeName(app.selection[i]) === "Group") {
                    return app.selection[i];
                }
            }
        }

        for (var p = 0; p < doc.pages.length; p++) {
            var found = findPageItemById(doc.pages[p], TEMPLATE_GROUP_ID);
            if (found && getTypeName(found) === "Group") return found;
        }

        return null;
    }

    function getOrCreateRgbColor(rgb, index) {
        var name =
            "tag_color_" +
            index +
            "_" +
            rgb[0] +
            "_" +
            rgb[1] +
            "_" +
            rgb[2];
        var color = doc.colors.itemByName(name);

        try {
            color.name;
            return color;
        } catch (e1) {}

        return doc.colors.add({
            name: name,
            model: ColorModel.PROCESS,
            space: ColorSpace.RGB,
            colorValue: rgb
        });
    }

    function moveToTopLeft(item, left, top) {
        var bounds = item.geometricBounds;
        var dx = left - bounds[1];
        var dy = top - bounds[0];
        item.move(undefined, [dx, dy]);
    }

    function setGeneratedLabel(item, entryIndex, tagIndex, tagText) {
        try {
            item.label =
                GENERATED_LABEL +
                "|entry=" +
                entryIndex +
                "|tag=" +
                tagIndex +
                "|text=" +
                tagText;
        } catch (e) {}
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
        var templateGroup = getTemplateGroup();

        if (!templateGroup) {
            alert(
                "找不到模板标签 Group。\n\n" +
                    "请先选中一个标签模板 Group 再运行脚本；或者确认 TEMPLATE_GROUP_ID 是否仍然正确。"
            );
            return;
        }

        var templateTextFrame = findTextFrame(templateGroup);
        var templateFillShape = findFillShape(templateGroup);

        if (!templateTextFrame || !templateFillShape) {
            alert(
                "模板 Group 不完整。\n\n" +
                    "需要在 Group 里找到一个文本框和一个 Oval/图形底色。"
            );
            return;
        }

        var entries;
        try {
            entries = extractEntries(parseJSON(readFile(JSON_PATH)));
        } catch (err) {
            alert("读取 JSON 失败：\n\n" + err.message);
            return;
        }

        if (MAX_ENTRIES > 0 && entries.length > MAX_ENTRIES) {
            entries = entries.slice(0, MAX_ENTRIES);
        }

        var removedCount = 0;
        if (CLEAR_PREVIOUS_GENERATED) {
            removedCount = clearPreviousGenerated();
        }

        var generatedCount = 0;
        var skippedEntries = 0;
        var colorIndex = 0;

        for (var entryIndex = 0; entryIndex < entries.length; entryIndex++) {
            var tags = normalizeTags(entries[entryIndex].tags);

            if (tags.length === 0) {
                skippedEntries++;
                continue;
            }

            for (var tagIndex = 0; tagIndex < tags.length; tagIndex++) {
                var tagText = tags[tagIndex];
                var duplicateGroup = templateGroup.duplicate();
                var duplicateTextFrame = findTextFrame(duplicateGroup);
                var duplicateFillShape = findFillShape(duplicateGroup);
                var rgb = PALETTE[colorIndex % PALETTE.length];
                var color = getOrCreateRgbColor(rgb, colorIndex + 1);

                duplicateTextFrame.contents = tagText;
                duplicateFillShape.fillColor = color;
                duplicateFillShape.strokeColor = doc.swatches.itemByName("None");
                setGeneratedLabel(
                    duplicateGroup,
                    entryIndex + 1,
                    tagIndex + 1,
                    tagText
                );

                moveToTopLeft(
                    duplicateGroup,
                    START_X + entryIndex * ENTRY_X_GAP,
                    START_Y - tagIndex * TAG_Y_GAP
                );

                generatedCount++;
                colorIndex++;
            }
        }

        if (!KEEP_TEMPLATE_VISIBLE) {
            try {
                templateGroup.visible = false;
            } catch (e) {}
        }

        alert(
            "标签生成完成。\n\n" +
                "JSON 条目数：" +
                entries.length +
                "\n生成标签数：" +
                generatedCount +
                "\n无 tags / 空 tags 条目：" +
                skippedEntries +
                "\n清理旧标签数：" +
                removedCount +
                "\n\n如果位置不合适，请调整脚本顶部的 START_X / START_Y / TAG_Y_GAP / ENTRY_X_GAP。"
        );
    }

    app.doScript(
        main,
        ScriptLanguage.JAVASCRIPT,
        undefined,
        UndoModes.ENTIRE_SCRIPT,
        "根据 JSON tags 生成图形标签"
    );
})();
