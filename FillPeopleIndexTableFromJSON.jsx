/*
  FillPeopleIndexTableFromJSON.jsx

  用法：
  1. 打开 InDesign 文档。
  2. 选中一个要灌入数据的文本框。
  3. 运行本脚本。
  4. 脚本读取同目录 diary_people_index.json，按 JSON 顺序写入：
     label<TAB>abbreviation<TAB>count
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

        // ====================================================================
        // 参数区
        // ====================================================================

        var PEOPLE_INDEX_JSON_FILE_NAME = "diary_people_index.json";
        var SCRIPT_FILE = new File($.fileName);
        var PEOPLE_INDEX_JSON_PATH =
            SCRIPT_FILE.parent.fsName + "/" + PEOPLE_INDEX_JSON_FILE_NAME;

        // 只灌入前多少条。设为 0 或负数表示灌入 JSON 里的全部条目。
        var MAX_ITEMS = 0;

        // true：替换选中文本框所属的整条 story。
        // 如果文本框被串接，开启这个可以避免旧内容残留在后续串接框里。
        var REPLACE_ENTIRE_STORY = true;

        // 灌入完成后是否弹窗提示数量。
        var SHOW_DONE_ALERT = true;

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

        function extractPeopleIndex(data) {
            if (data instanceof Array) return data;
            if (data.people instanceof Array) return data.people;
            if (data.data instanceof Array) return data.data;
            throw new Error(
                "人物索引 JSON 结构无法识别：需要根结构是数组，或包含 people / data 数组。"
            );
        }

        function normalizeCell(value) {
            if (value === null || value === undefined) return "";
            return String(value).replace(/[\r\n\t]+/g, " ").replace(/^\s+|\s+$/g, "");
        }

        function getTypeName(item) {
            try {
                if (item.typename) return item.typename;
            } catch (e1) {}

            try {
                if (item.constructor && item.constructor.name) {
                    return item.constructor.name;
                }
            } catch (e2) {}

            return "";
        }

        function isValidItem(item) {
            try {
                return item && item.isValid;
            } catch (e) {
                return false;
            }
        }

        function isTextFrame(item) {
            if (!isValidItem(item)) return false;

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

        function getSelectedTextFrame() {
            if (app.selection.length === 0) return null;

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

        function buildTableText(peopleIndex) {
            var lines = [];
            var limit = peopleIndex.length;

            if (MAX_ITEMS > 0 && MAX_ITEMS < limit) {
                limit = MAX_ITEMS;
            }

            for (var i = 0; i < limit; i++) {
                var item = peopleIndex[i];
                var label = normalizeCell(item.label);
                var abbreviation = normalizeCell(item.abbreviation);
                var count = normalizeCell(item.count);

                if (label === "" && abbreviation === "" && count === "") {
                    continue;
                }

                lines.push(label + "\t" + abbreviation + "\t" + count);
            }

            return lines.join("\r");
        }

        function getStoryOfTextFrame(textFrame) {
            try {
                if (textFrame.parentStory && textFrame.parentStory.isValid) {
                    return textFrame.parentStory;
                }
            } catch (e1) {}

            return null;
        }

        function setTextFrameContents(textFrame, text) {
            var story = REPLACE_ENTIRE_STORY ? getStoryOfTextFrame(textFrame) : null;

            if (story) {
                story.contents = "";
                story.contents = text;
                return;
            }

            textFrame.contents = "";
            textFrame.contents = text;
        }

        function main() {
            var targetFrame = getSelectedTextFrame();
            if (!targetFrame) {
                alert("请先选中一个文本框。");
                return;
            }

            var jsonText = readFile(PEOPLE_INDEX_JSON_PATH);
            var jsonData = parseJSON(jsonText);
            var peopleIndex = extractPeopleIndex(jsonData);
            var tableText = buildTableText(peopleIndex);

            setTextFrameContents(targetFrame, tableText);

            if (SHOW_DONE_ALERT) {
                alert(
                    "已灌入 " +
                        (tableText === "" ? 0 : tableText.split("\r").length) +
                        " 行人物索引数据。"
                );
            }
        }

        app.doScript(
            main,
            ScriptLanguage.JAVASCRIPT,
            undefined,
            UndoModes.ENTIRE_SCRIPT,
            "Fill People Index Table From JSON"
        );
    } catch (error) {
        alert("脚本出错：\n" + errorText(error) + "\n\n行号：" + errorLine(error));
    }
})();
