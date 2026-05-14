// inspectDOM_full.jsx — 完整导出 InDesign 文档 DOM 树
// 不省略、不截断，仅用 visited 集合防循环引用

(function () {
    var MAX_DEPTH = 100; // 安全上限，正常文档远到不了
    var TEXT_PREVIEW = 80; // 文本内容预览长度，设为 0 则输出完整文本
    var visited = {}; // 防循环引用
    var uidCounter = 0;

    // 想要遍历的集合名（按重要性排序）
    var COLLECTIONS = [
        "pages",
        "spreads",
        "masterSpreads",
        "layers",
        "pageItems",
        "textFrames",
        "rectangles",
        "ovals",
        "polygons",
        "groups",
        "graphicLines",
        "graphics",
        "images",
        "epss",
        "pdfs",
        "stories",
        "paragraphStyles",
        "characterStyles",
        "objectStyles",
        "tableStyles",
        "cellStyles",
        "paragraphStyleGroups",
        "characterStyleGroups",
        "swatches",
        "colors",
        "gradients",
        "tints",
        "fonts",
        "sections",
        "bookmarks",
        "hyperlinks",
        "crossReferences",
        "tables",
        "cells",
        "rows",
        "columns",
        "anchoredObjectSettings",
        "footnotes",
        "endnotes",
        "tags",
        "xmlElements",
        "links",
        "guides",
    ];

    // 想要打印的标量属性（按对象类型选择性显示）
    var SCALAR_PROPS = [
        "name",
        "id",
        "label",
        "contents",
        "geometricBounds",
        "visibleBounds",
        "fillColor",
        "strokeColor",
        "strokeWeight",
        "appliedParagraphStyle",
        "appliedCharacterStyle",
        "appliedObjectStyle",
        "pointSize",
        "leading",
        "tracking",
        "fontStyle",
        "appliedFont",
        "horizontalScale",
        "verticalScale",
        "rotationAngle",
        "shearAngle",
        "visible",
        "locked",
        "itemLayer",
        "parentStory",
        "previousTextFrame",
        "nextTextFrame",
        "overflows",
        "isValid",
        "index",
        "documentPreferences",
        "filePath",
        "linkType",
        "status",
    ];

    function safeGet(obj, prop) {
        try {
            var v = obj[prop];
            if (v === undefined || v === null) return null;
            return v;
        } catch (e) {
            return null;
        }
    }

    function getObjId(obj) {
        // 用 InDesign 自己的 id（如果有）作为唯一标识，否则给一个递增 uid
        try {
            if (obj.id !== undefined) return "id:" + obj.id;
        } catch (e) {}
        if (!obj.__inspect_uid) {
            obj.__inspect_uid = ++uidCounter;
        }
        return "uid:" + obj.__inspect_uid;
    }

    function getClassName(obj) {
        try {
            return obj.constructor.name;
        } catch (e) {
            return "Unknown";
        }
    }

    function formatValue(v) {
        if (v === null || v === undefined) return "null";
        var t = typeof v;
        if (t === "string") {
            if (TEXT_PREVIEW > 0 && v.length > TEXT_PREVIEW) {
                return (
                    quoteString(v.substr(0, TEXT_PREVIEW)) +
                    "...(+" +
                    (v.length - TEXT_PREVIEW) +
                    " chars)"
                );
            }
            return quoteString(v);
        }
        if (t === "number" || t === "boolean") return String(v);
        if (v instanceof Array) {
            var parts = [];
            for (var i = 0; i < v.length; i++) parts.push(formatValue(v[i]));
            return "[" + parts.join(", ") + "]";
        }
        if (t === "object") {
            try {
                var cls = getClassName(v);
                var nm = "";
                try {
                    if (v.name) nm = " '" + v.name + "'";
                } catch (e) {}
                return "<" + cls + nm + ">";
            } catch (e) {
                return "<object>";
            }
        }
        return String(v);
    }

    function quoteString(text) {
        text = String(text);
        text = text.replace(/\\/g, "\\\\");
        text = text.replace(/"/g, '\\"');
        text = text.replace(/\r/g, "\\r");
        text = text.replace(/\n/g, "\\n");
        text = text.replace(/\t/g, "\\t");
        return '"' + text + '"';
    }

    function indent(depth) {
        var s = "";
        for (var i = 0; i < depth; i++) s += "  ";
        return s;
    }

    function inspectObject(obj, depth, label) {
        if (depth > MAX_DEPTH) return indent(depth) + "... MAX_DEPTH reached\n";
        if (obj === null || obj === undefined)
            return indent(depth) + (label || "") + "null\n";

        var className = getClassName(obj);
        var objId = getObjId(obj);

        // 循环引用检测
        if (visited[objId]) {
            return (
                indent(depth) +
                (label ? label + ": " : "") +
                className +
                " " +
                objId +
                " [→ already shown]\n"
            );
        }
        visited[objId] = true;

        var out =
            indent(depth) +
            (label ? label + ": " : "") +
            className +
            " " +
            objId;
        try {
            if (obj.name) out += " '" + obj.name + "'";
        } catch (e) {}
        out += "\n";

        // 打印标量属性
        for (var i = 0; i < SCALAR_PROPS.length; i++) {
            var prop = SCALAR_PROPS[i];
            var val = safeGet(obj, prop);
            if (val === null) continue;
            // 跳过 parent 类引用，避免巨量回环
            if (
                prop === "parentStory" ||
                prop === "previousTextFrame" ||
                prop === "nextTextFrame"
            ) {
                out +=
                    indent(depth + 1) +
                    "." +
                    prop +
                    " = " +
                    formatValue(val) +
                    "\n";
                continue;
            }
            out +=
                indent(depth + 1) +
                "." +
                prop +
                " = " +
                formatValue(val) +
                "\n";
        }

        // 递归进入每个集合
        for (var c = 0; c < COLLECTIONS.length; c++) {
            var colName = COLLECTIONS[c];
            var col = safeGet(obj, colName);
            if (col === null) continue;
            var len;
            try {
                len = col.length;
            } catch (e) {
                continue;
            }
            if (typeof len !== "number" || len === 0) continue;

            out += indent(depth + 1) + "[" + colName + "] count=" + len + "\n";
            for (var k = 0; k < len; k++) {
                var child;
                try {
                    child = col[k];
                } catch (e) {
                    continue;
                }
                out += inspectObject(child, depth + 2, "[" + k + "]");
            }
        }

        return out;
    }

    if (app.documents.length === 0) {
        alert("没有打开的文档");
        return;
    }

    var doc = app.activeDocument;
    var result = "InDesign DOM Dump\n";
    result += "Document: " + doc.name + "\n";
    result += "Generated: " + new Date().toString() + "\n";
    result += "=======================================\n\n";
    result += inspectObject(doc, 0, "ROOT");

    // 写文件
    var f = File("~/Desktop/indesign_dom_full.txt");
    f.encoding = "UTF-8";
    f.open("w");
    f.write(result);
    f.close();

    alert(
        "完整 DOM 已导出到桌面：indesign_dom_full.txt\n大小：" +
            Math.round(result.length / 1024) +
            " KB"
    );
})();
