/*
  文件: InspectSelectedStructure.jsx

  用途:
  - 检查当前选中对象或 Group 的 DOM 结构，并生成可读的树状报告。

  使用前:
  - 打开 InDesign 文档。
  - 选中一个或多个对象或组。

  运行流程:
  1. 运行脚本。
  2. 查看弹窗中的对象类型、名称、id、label、页面、图层、边界、文本摘要和图像链接信息。
  3. 需要时点击按钮复制报告到 macOS 剪贴板。

  注意:
  - 适合在编写或调试模板脚本前确认 Group 内部结构。
  - 读取属性时做了安全包装，尽量避免 InDesign DOM 特殊属性报错。
*/
(function () {
    try {
        app.doScript(
            runStructureInspector,
            ScriptLanguage.JAVASCRIPT,
            undefined,
            UndoModes.ENTIRE_SCRIPT,
            "输出选中对象结构"
        );
    } catch (error) {
        alert(
            "脚本执行失败：\n" +
                error.message +
                (error.line ? "\n行号: " + error.line : "")
        );
    }
})();

function runStructureInspector() {
    if (app.documents.length === 0) {
        alert("请先打开一个 InDesign 文档。");
        return;
    }

    if (!app.selection || app.selection.length === 0) {
        alert("请先选中一个对象或一个组，然后再运行脚本。");
        return;
    }

    var doc = app.activeDocument;
    var lines = [];
    var seen = {};

    lines.push("选中对象结构");
    lines.push("文档: " + valueOrBlank(safeRead(doc, "name")));
    lines.push("生成时间: " + new Date().toString());
    lines.push("选中数量: " + app.selection.length);
    lines.push("");

    for (var i = 0; i < app.selection.length; i++) {
        lines.push("selection[" + i + "]");
        appendItemTree(app.selection[i], lines, 0, seen, "selection[" + i + "]");
        if (i < app.selection.length - 1) {
            lines.push("");
        }
    }

    showReportDialog(lines.join("\n"));
}

function appendItemTree(item, lines, depth, seen, path) {
    var indent = repeat("  ", depth);
    var typeText = getFriendlyType(item);
    var className = getClassName(item);
    var name = safeRead(item, "name");
    var label = safeRead(item, "label");
    var id = safeRead(item, "id");
    var key = getObjectKey(item, path);
    var childCount = getDirectChildCount(item);

    lines.push(indent + "- " + typeText + " [" + className + "]" + formatIdentity(name, id));

    if (label !== null && label !== undefined && String(label) !== "") {
        lines.push(indent + "  label: " + String(label));
    }

    lines.push(indent + "  page: " + valueOrBlank(getParentPageName(item)));
    lines.push(indent + "  layer: " + valueOrBlank(getLayerName(item)));
    appendBoundsLine(item, lines, indent + "  ");
    appendTextSummary(item, lines, indent + "  ");
    appendGraphicSummary(item, lines, indent + "  ");

    if (childCount > 0) {
        lines.push(indent + "  children: " + childCount);
    }

    if (seen[key]) {
        lines.push(indent + "  (已在上方出现，停止递归)");
        return;
    }
    seen[key] = true;

    if (collectionLength(safeRead(item, "pageItems")) > 0) {
        appendCollectionTree(item, "pageItems", lines, depth + 1, seen, path);
    } else {
        appendCollectionTree(item, "textFrames", lines, depth + 1, seen, path);
        appendCollectionTree(item, "rectangles", lines, depth + 1, seen, path);
        appendCollectionTree(item, "ovals", lines, depth + 1, seen, path);
        appendCollectionTree(item, "polygons", lines, depth + 1, seen, path);
        appendCollectionTree(item, "graphicLines", lines, depth + 1, seen, path);
    }
    appendGraphicChildren(item, lines, depth + 1, seen, path);
}

function appendCollectionTree(item, prop, lines, depth, seen, path) {
    if (!hasProperty(item, prop)) {
        return;
    }

    var collection = safeRead(item, prop);
    var count = collectionLength(collection);
    for (var i = 0; i < count; i++) {
        var child = null;
        try {
            child = collection[i];
        } catch (error) {
            lines.push(repeat("  ", depth) + "- " + prop + "[" + i + "]: [无法读取: " + error + "]");
            continue;
        }
        appendItemTree(child, lines, depth, seen, path + "." + prop + "[" + i + "]");
    }
}

function appendGraphicChildren(item, lines, depth, seen, path) {
    if (!hasProperty(item, "graphics")) {
        return;
    }

    var graphics = safeRead(item, "graphics");
    var count = collectionLength(graphics);
    for (var i = 0; i < count; i++) {
        var graphic = null;
        try {
            graphic = graphics[i];
        } catch (error) {
            lines.push(repeat("  ", depth) + "- graphics[" + i + "]: [无法读取: " + error + "]");
            continue;
        }

        var indent = repeat("  ", depth);
        var link = safeRead(graphic, "itemLink");
        var linkName = getName(link);
        var linkStatus = enumToString(safeRead(link, "status"));
        lines.push(
            indent +
                "- 置入内容 [" +
                getClassName(graphic) +
                "]" +
                (linkName ? " file=\"" + linkName + "\"" : "")
        );
        if (linkStatus) {
            lines.push(indent + "  linkStatus: " + linkStatus);
        }
    }
}

function getDirectChildCount(item) {
    var total = 0;
    total += collectionLength(safeRead(item, "pageItems"));
    total += collectionLength(safeRead(item, "graphics"));
    return total;
}

function getFriendlyType(item) {
    var className = getClassName(item);

    if (className === "Group") {
        return "组";
    }

    if (isTextLike(item)) {
        return "文字框架";
    }

    if (collectionLength(safeRead(item, "graphics")) > 0) {
        return "图像框架";
    }

    if (className === "Rectangle" || className === "Oval" || className === "Polygon") {
        return "空图形框架/形状";
    }

    if (className === "GraphicLine") {
        return "线条";
    }

    return "对象";
}

function isTextLike(item) {
    var className = getClassName(item);
    if (className === "TextFrame") {
        return true;
    }
    return collectionLength(safeRead(item, "texts")) > 0 || hasProperty(item, "parentStory");
}

function appendBoundsLine(item, lines, prefix) {
    var bounds = safeRead(item, "geometricBounds");
    if (!isArrayLike(bounds) || bounds.length < 4) {
        return;
    }

    var top = toNumber(bounds[0]);
    var left = toNumber(bounds[1]);
    var bottom = toNumber(bounds[2]);
    var right = toNumber(bounds[3]);
    if (top === null || left === null || bottom === null || right === null) {
        lines.push(prefix + "bounds: " + makeSimpleValue(bounds));
        return;
    }

    lines.push(
        prefix +
            "bounds: top=" +
            formatNumber(top) +
            ", left=" +
            formatNumber(left) +
            ", bottom=" +
            formatNumber(bottom) +
            ", right=" +
            formatNumber(right)
    );
    lines.push(
        prefix +
            "size: width=" +
            formatNumber(right - left) +
            ", height=" +
            formatNumber(bottom - top)
    );
}

function appendTextSummary(item, lines, prefix) {
    if (!isTextLike(item)) {
        return;
    }

    var text = null;
    var texts = safeRead(item, "texts");
    if (collectionLength(texts) > 0) {
        try {
            text = texts[0];
        } catch (error) {
            text = null;
        }
    }
    if (text === null && hasProperty(item, "parentStory")) {
        text = safeRead(item, "parentStory");
    }

    var contents = safeRead(text || item, "contents");
    if (contents === null || contents === undefined) {
        return;
    }

    contents = String(contents);
    lines.push(prefix + "textLength: " + contents.length);
    lines.push(prefix + "textPreview: \"" + shortenText(contents, 120) + "\"");
}

function appendGraphicSummary(item, lines, prefix) {
    var graphics = safeRead(item, "graphics");
    var count = collectionLength(graphics);
    if (count === 0) {
        return;
    }

    lines.push(prefix + "graphics: " + count);
    for (var i = 0; i < count; i++) {
        try {
            var graphic = graphics[i];
            var link = safeRead(graphic, "itemLink");
            var linkName = getName(link);
            var linkPath = safeRead(link, "filePath");
            lines.push(
                prefix +
                    "graphic[" +
                    i +
                    "]: " +
                    getClassName(graphic) +
                    (linkName ? ", file=" + linkName : "")
            );
            if (linkPath) {
                lines.push(prefix + "graphic[" + i + "] path: " + linkPath);
            }
        } catch (error) {
            lines.push(prefix + "graphic[" + i + "]: [无法读取: " + error + "]");
        }
    }
}

function showReportDialog(reportText) {
    var dlg = new Window("dialog", "选中对象结构");
    dlg.orientation = "column";
    dlg.alignChildren = "fill";
    dlg.margins = 16;
    dlg.spacing = 10;

    var reportBox = dlg.add("edittext", undefined, reportText, {
        multiline: true,
        scrolling: true
    });
    reportBox.preferredSize = [760, 520];
    reportBox.active = true;

    var statusText = dlg.add("statictext", undefined, " ");
    statusText.characters = 80;

    var buttons = dlg.add("group");
    buttons.alignment = "right";
    var copyButton = buttons.add("button", undefined, "复制到剪贴板");
    buttons.add("button", undefined, "关闭", { name: "ok" });

    copyButton.onClick = function () {
        try {
            copyTextToClipboard(reportText);
            statusText.text = "已复制到剪贴板。";
        } catch (error) {
            alert("复制到剪贴板失败：\n" + error.message);
        }
    };

    dlg.show();
}

function copyTextToClipboard(text) {
    if (!isMac()) {
        throw new Error("当前脚本只内置了 macOS 剪贴板复制方式。");
    }

    var appleScriptLanguage = getAppleScriptLanguage();
    var directError = null;

    try {
        app.doScript(
            "set the clipboard to " + toAppleScriptTextExpression(text),
            appleScriptLanguage
        );
        verifyClipboardHasText(text, appleScriptLanguage);
        return;
    } catch (error) {
        directError = error;
    }

    var tempFile = File(Folder.temp + "/indesign_selected_object_structure.txt");
    tempFile.encoding = "UTF-8";
    if (!tempFile.open("w")) {
        throw new Error("无法写入临时文件: " + tempFile.fsName);
    }
    tempFile.write(text);
    tempFile.close();

    var appleScript =
        'do shell script ("/bin/cat " & quoted form of "' +
        escapeAppleScriptString(tempFile.fsName) +
        '" & " | /usr/bin/pbcopy")';

    try {
        app.doScript(appleScript, appleScriptLanguage);
        verifyClipboardHasText(text, appleScriptLanguage);
    } catch (fallbackError) {
        throw new Error(
            "直接写入失败: " +
                directError +
                "\n备用 pbcopy 写入也失败: " +
                fallbackError
        );
    }
}

function verifyClipboardHasText(expectedText, appleScriptLanguage) {
    var clipboardText = "";
    try {
        clipboardText = app.doScript("the clipboard as text", appleScriptLanguage);
    } catch (error) {
        return;
    }

    if (clipboardText === null || clipboardText === undefined) {
        throw new Error("剪贴板读回为空。");
    }

    clipboardText = String(clipboardText);
    if (clipboardText.length === 0 && String(expectedText).length > 0) {
        throw new Error("剪贴板读回为空。");
    }

    var expectedStart = String(expectedText).substr(0, 20);
    if (expectedStart && clipboardText.indexOf(expectedStart) !== 0) {
        throw new Error("剪贴板读回内容与输出结果不一致。");
    }
}

function getAppleScriptLanguage() {
    if (ScriptLanguage.APPLESCRIPT_LANGUAGE !== undefined) {
        return ScriptLanguage.APPLESCRIPT_LANGUAGE;
    }
    if (ScriptLanguage.applescriptLanguage !== undefined) {
        return ScriptLanguage.applescriptLanguage;
    }
    throw new Error("当前 InDesign 环境找不到 AppleScript 脚本语言常量。");
}

function toAppleScriptTextExpression(text) {
    text = String(text);
    if (text.length === 0) {
        return '""';
    }

    text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    var parts = text.split("\n");
    var expression = "";
    for (var i = 0; i < parts.length; i++) {
        if (i > 0) {
            expression += " & linefeed & ";
        }
        expression += '"' + escapeAppleScriptString(parts[i]) + '"';
    }
    return expression;
}

function isMac() {
    try {
        return String($.os).toLowerCase().indexOf("mac") >= 0;
    } catch (error) {
        return true;
    }
}

function escapeAppleScriptString(value) {
    return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function formatIdentity(name, id) {
    var out = "";
    if (name !== null && name !== undefined && String(name) !== "") {
        out += " name=\"" + String(name) + "\"";
    }
    if (id !== null && id !== undefined && String(id) !== "") {
        out += " id=" + String(id);
    }
    return out;
}

function getObjectKey(item, fallback) {
    var id = safeRead(item, "id");
    if (id !== null && id !== undefined && String(id) !== "") {
        return "id:" + String(id);
    }

    var specifier = safeToSpecifier(item);
    if (specifier) {
        return "specifier:" + specifier;
    }

    return "path:" + fallback;
}

function safeRead(obj, prop) {
    if (obj === null || obj === undefined) {
        return null;
    }

    if (hasReflect(obj) && prop !== "length" && !reflectHasProperty(obj, prop)) {
        return null;
    }

    try {
        return obj[prop];
    } catch (error) {
        return null;
    }
}

function hasProperty(obj, prop) {
    if (obj === null || obj === undefined) {
        return false;
    }

    if (hasReflect(obj)) {
        return reflectHasProperty(obj, prop);
    }

    try {
        return obj[prop] !== undefined;
    } catch (error) {
        return false;
    }
}

function hasReflect(obj) {
    try {
        return !!(obj && obj.reflect && obj.reflect.properties);
    } catch (error) {
        return false;
    }
}

function reflectHasProperty(obj, prop) {
    try {
        var properties = obj.reflect.properties;
        for (var i = 0; i < properties.length; i++) {
            if (properties[i].name === prop) {
                return true;
            }
        }
    } catch (error) {
        return false;
    }
    return false;
}

function collectionLength(collection) {
    try {
        if (collection && collection.length !== undefined) {
            return Number(collection.length);
        }
    } catch (error) {}
    return 0;
}

function getClassName(obj) {
    try {
        if (obj && obj.constructor && obj.constructor.name) {
            return obj.constructor.name;
        }
    } catch (error) {}

    try {
        return String(obj)
            .replace(/^\[object /, "")
            .replace(/\]$/, "");
    } catch (stringError) {
        return "Unknown";
    }
}

function getName(obj) {
    return safeRead(obj, "name");
}

function getLayerName(item) {
    return getName(safeRead(item, "itemLayer"));
}

function getParentPageName(item) {
    var page = safeRead(item, "parentPage");
    var pageName = getName(page);
    if (pageName) {
        return pageName;
    }

    var parent = safeRead(item, "parent");
    var guard = 0;
    while (parent && guard < 10) {
        page = safeRead(parent, "parentPage");
        pageName = getName(page);
        if (pageName) {
            return pageName;
        }
        parent = safeRead(parent, "parent");
        guard++;
    }

    return null;
}

function safeToSpecifier(obj) {
    try {
        if (obj && obj.toSpecifier) {
            return obj.toSpecifier();
        }
    } catch (error) {}
    return null;
}

function enumToString(value) {
    if (value === null || value === undefined) {
        return "";
    }
    try {
        return String(value);
    } catch (error) {
        return "";
    }
}

function isArrayLike(value) {
    try {
        return value && typeof value !== "string" && value.length !== undefined;
    } catch (error) {
        return false;
    }
}

function toNumber(value) {
    var numberValue = Number(value);
    if (isNaN(numberValue)) {
        return null;
    }
    return numberValue;
}

function formatNumber(value) {
    return String(Math.round(value * 1000) / 1000);
}

function makeSimpleValue(value) {
    if (value === null || value === undefined) {
        return "";
    }
    if (isArrayLike(value)) {
        var parts = [];
        for (var i = 0; i < value.length; i++) {
            parts.push(makeSimpleValue(value[i]));
        }
        return "[" + parts.join(", ") + "]";
    }
    try {
        return String(value);
    } catch (error) {
        return "";
    }
}

function shortenText(text, maxLength) {
    text = String(text).replace(/\r/g, "\\r").replace(/\n/g, "\\n");
    if (text.length <= maxLength) {
        return text;
    }
    return text.substr(0, maxLength - 3) + "...";
}

function valueOrBlank(value) {
    if (value === null || value === undefined || String(value) === "") {
        return "(无)";
    }
    return String(value);
}

function repeat(text, count) {
    var out = "";
    for (var i = 0; i < count; i++) {
        out += text;
    }
    return out;
}
