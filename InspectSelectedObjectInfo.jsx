/*
  文件: InspectSelectedObjectInfo.jsx

  用途:
  - 检查当前选中对象的详细信息，尤其用于判断参考线是否位于主页、跨页、图层或锁定对象上。

  使用前:
  - 打开 InDesign 文档。
  - 选中一个或多个需要检查的对象；对象不局限于参考线。

  运行流程:
  1. 运行脚本。
  2. 查看弹窗中的对象类型、父级页面/跨页/主页、图层、锁定状态、边界、链接和父级链路。
  3. 需要时点击“复制到剪贴板”，把完整报告粘贴出来继续排查。

  注意:
  - 本脚本只读取信息，不删除、不移动、不修改文档。
  - 如果对象是主页参考线，报告中的 parent chain 通常会出现 MasterSpread。
*/
function main() {
    if (app.documents.length === 0) {
        alert("请先打开一个 InDesign 文档。");
        return;
    }

    if (!app.selection || app.selection.length === 0) {
        alert("请先选中一个对象，然后再运行脚本。");
        return;
    }

    var doc = app.activeDocument;
    var lines = [];

    lines.push("选中对象诊断报告");
    lines.push("文档: " + valueOrBlank(safeRead(doc, "name")));
    lines.push("生成时间: " + new Date().toString());
    lines.push("选中数量: " + app.selection.length);
    lines.push("文档参考线总数: " + collectionLength(safeRead(doc, "guides")));
    lines.push("");
    lines.push("说明: 本脚本只读取信息，不会删除或修改对象。");
    lines.push("");

    for (var i = 0; i < app.selection.length; i++) {
        if (i > 0) {
            lines.push("");
            lines.push(repeat("-", 72));
            lines.push("");
        }
        appendSelectionReport(app.selection[i], i, lines);
    }

    showReportDialog(lines.join("\n"));
}

function appendSelectionReport(item, index, lines) {
    var className = getClassName(item);
    var isGuide = isGuideObject(item);

    lines.push("selection[" + index + "]");
    lines.push("对象判断: " + getFriendlyType(item));
    lines.push("class: " + className);
    lines.push("id: " + valueOrBlank(safeRead(item, "id")));
    lines.push("name: " + quotedOrBlank(safeRead(item, "name")));
    lines.push("label: " + quotedOrBlank(safeRead(item, "label")));
    lines.push("isValid: " + valueOrBlank(safeRead(item, "isValid")));
    lines.push("可调用 remove(): " + (hasMethod(item, "remove") ? "是" : "否/无法确认"));
    lines.push("toSpecifier: " + valueOrBlank(safeToSpecifier(item)));
    lines.push("");

    appendDeletionDiagnostics(item, lines);
    lines.push("");

    appendLocationInfo(item, lines);
    lines.push("");

    appendLayerInfo(item, lines);
    lines.push("");

    if (isGuide) {
        appendGuideInfo(item, lines);
        lines.push("");
    }

    appendLockVisibilityInfo(item, lines);
    lines.push("");

    appendBoundsInfo(item, lines);
    appendTextInfo(item, lines);
    appendGraphicInfo(item, lines);
    lines.push("");

    appendParentChain(item, lines);
    lines.push("");

    appendReflectProperties(item, lines);
}

function appendDeletionDiagnostics(item, lines) {
    var reasons = [];
    var className = getClassName(item);
    var layer = safeRead(item, "itemLayer");

    if (isGuideObject(item)) {
        reasons.push("它看起来是参考线对象（Guide）。");
    } else {
        reasons.push("它不是普通意义上可确认的 Guide；如果你看到的是线，可能是线条、框架边缘、网格或其他页面对象。");
    }

    if (isInMasterContext(item)) {
        reasons.push("父级链路里检测到 MasterSpread，说明它很可能在主页/母版上。普通页面上看到它时，可能需要切到对应主页删除。");
    }

    if (safeRead(item, "locked") === true) {
        reasons.push("对象自身 locked=true。");
    }

    if (layer) {
        if (safeRead(layer, "locked") === true) {
            reasons.push("所在图层 locked=true。");
        }
        if (safeRead(layer, "visible") === false) {
            reasons.push("所在图层 visible=false。");
        }
    }

    var lockedParent = findLockedParent(item);
    if (lockedParent) {
        reasons.push("父级对象存在 locked=true: " + describeObjectOneLine(lockedParent) + "。");
    }

    if (!hasMethod(item, "remove")) {
        reasons.push("脚本层面没有确认到 remove() 方法，可能不是可直接删除的页面对象，或该 DOM 对象比较特殊。");
    }

    lines.push("删除/定位线索:");
    for (var i = 0; i < reasons.length; i++) {
        lines.push("  - " + reasons[i]);
    }

    if (className === "Guide" || isGuideObject(item)) {
        lines.push("  - 如果要进一步确认，请重点看下面的 page / spread / parent chain / layer。");
    }
}

function appendLocationInfo(item, lines) {
    var page = getNearestPage(item);
    var spread = getNearestSpread(item);
    var master = getNearestMasterSpread(item);

    lines.push("位置:");
    lines.push("  parentPage: " + describePage(page));
    lines.push("  spread: " + describeSpread(spread));
    lines.push("  masterSpread: " + describeSpread(master));
    lines.push("  位于主页/母版: " + (isInMasterContext(item) ? "是" : "否/未检测到"));

    if (page) {
        lines.push("  页面可见页码 page.name: " + valueOrBlank(safeRead(page, "name")));
        lines.push("  页面文档顺序 documentOffset+1: " + valueOrBlank(getDocumentOffsetText(page)));
        lines.push("  appliedMaster: " + describeObjectOneLine(safeRead(page, "appliedMaster")));
    }
}

function appendLayerInfo(item, lines) {
    var layer = safeRead(item, "itemLayer");

    lines.push("图层:");
    if (!layer) {
        lines.push("  itemLayer: [无法读取]");
        return;
    }

    lines.push("  name: " + quotedOrBlank(safeRead(layer, "name")));
    lines.push("  id: " + valueOrBlank(safeRead(layer, "id")));
    lines.push("  locked: " + valueOrBlank(safeRead(layer, "locked")));
    lines.push("  visible: " + valueOrBlank(safeRead(layer, "visible")));
    lines.push("  printable: " + valueOrBlank(safeRead(layer, "printable")));
}

function appendGuideInfo(item, lines) {
    lines.push("参考线属性:");
    lines.push("  orientation: " + enumToString(safeRead(item, "orientation")));
    lines.push("  location: " + valueOrBlank(safeRead(item, "location")));
    lines.push("  fitToPage: " + valueOrBlank(safeRead(item, "fitToPage")));
    lines.push("  guideColor: " + makeSimpleValue(safeRead(item, "guideColor")));
    lines.push("  viewThreshold: " + valueOrBlank(safeRead(item, "viewThreshold")));
    lines.push("  rulerOrigin: " + enumToString(safeRead(item, "rulerOrigin")));
    lines.push("  guideType: " + enumToString(safeRead(item, "guideType")));
}

function appendLockVisibilityInfo(item, lines) {
    lines.push("锁定/可见:");
    lines.push("  locked: " + valueOrBlank(safeRead(item, "locked")));
    lines.push("  visible: " + valueOrBlank(safeRead(item, "visible")));
    lines.push("  hidden: " + valueOrBlank(safeRead(item, "hidden")));
    lines.push("  printable: " + valueOrBlank(safeRead(item, "printable")));
    lines.push("  nonprinting: " + valueOrBlank(safeRead(item, "nonprinting")));
}

function appendBoundsInfo(item, lines) {
    var geometricBounds = safeRead(item, "geometricBounds");
    var visibleBounds = safeRead(item, "visibleBounds");
    var bounds = safeRead(item, "bounds");

    lines.push("边界/坐标:");
    lines.push("  geometricBounds: " + formatBounds(geometricBounds));
    lines.push("  visibleBounds: " + formatBounds(visibleBounds));
    lines.push("  bounds: " + formatBounds(bounds));
}

function appendTextInfo(item, lines) {
    if (!isTextLike(item)) {
        return;
    }

    var text = getTextSource(item);
    var contents = safeRead(text || item, "contents");
    if (contents === null || contents === undefined) {
        return;
    }

    contents = String(contents);
    lines.push("文字:");
    lines.push("  textLength: " + contents.length);
    lines.push("  textPreview: \"" + shortenText(contents, 180) + "\"");
    lines.push("  overflows: " + valueOrBlank(safeRead(item, "overflows")));
}

function appendGraphicInfo(item, lines) {
    var graphics = safeRead(item, "graphics");
    var count = collectionLength(graphics);

    if (count === 0) {
        return;
    }

    lines.push("置入内容:");
    lines.push("  graphics: " + count);
    for (var i = 0; i < count; i++) {
        try {
            var graphic = graphics[i];
            var link = safeRead(graphic, "itemLink");
            lines.push("  graphic[" + i + "]: " + describeObjectOneLine(graphic));
            lines.push("    linkName: " + quotedOrBlank(safeRead(link, "name")));
            lines.push("    linkPath: " + valueOrBlank(safeRead(link, "filePath")));
            lines.push("    linkStatus: " + enumToString(safeRead(link, "status")));
        } catch (error) {
            lines.push("  graphic[" + i + "]: [无法读取: " + error + "]");
        }
    }
}

function appendParentChain(item, lines) {
    lines.push("parent chain:");
    lines.push("  self: " + describeObjectOneLine(item));

    var parent = safeRead(item, "parent");
    var guard = 0;
    while (parent && guard < 20) {
        lines.push("  parent[" + guard + "]: " + describeObjectOneLine(parent));
        parent = safeRead(parent, "parent");
        guard++;
    }

    if (guard >= 20) {
        lines.push("  [父级链路超过 20 层，已停止]");
    }
}

function appendReflectProperties(item, lines) {
    var names = getReflectPropertyNames(item, 120);

    lines.push("可见 DOM 属性名（前 120 个）:");
    if (names.length === 0) {
        lines.push("  [无法从 reflect.properties 读取]");
        return;
    }

    lines.push("  " + names.join(", "));
}

function getFriendlyType(item) {
    var className = getClassName(item);

    if (isGuideObject(item)) {
        return "参考线 / Guide";
    }
    if (className === "Group") {
        return "组 / Group";
    }
    if (isTextLike(item)) {
        return "文字框架 / TextFrame";
    }
    if (collectionLength(safeRead(item, "graphics")) > 0) {
        return "图像框架或置入内容容器";
    }
    if (className === "GraphicLine") {
        return "线条 / GraphicLine";
    }
    if (className === "Rectangle" || className === "Oval" || className === "Polygon") {
        return "图形框架/形状";
    }

    return "对象";
}

function isGuideObject(item) {
    var className = getClassName(item);
    if (className === "Guide") {
        return true;
    }

    return (
        hasProperty(item, "orientation") &&
        hasProperty(item, "location") &&
        hasProperty(item, "fitToPage")
    );
}

function isTextLike(item) {
    var className = getClassName(item);
    if (className === "TextFrame") {
        return true;
    }
    return collectionLength(safeRead(item, "texts")) > 0 || hasProperty(item, "parentStory");
}

function getTextSource(item) {
    var texts = safeRead(item, "texts");
    if (collectionLength(texts) > 0) {
        try {
            return texts[0];
        } catch (error) {}
    }

    if (hasProperty(item, "parentStory")) {
        return safeRead(item, "parentStory");
    }

    return item;
}

function getNearestPage(item) {
    var page = safeRead(item, "parentPage");
    if (page) {
        return page;
    }

    return getNearestParentByClass(item, "Page");
}

function getNearestSpread(item) {
    var page = getNearestPage(item);
    var pageParent = safeRead(page, "parent");
    if (pageParent && getClassName(pageParent) === "Spread") {
        return pageParent;
    }

    var spread = getNearestParentByClass(item, "Spread");
    if (spread) {
        return spread;
    }

    return null;
}

function getNearestMasterSpread(item) {
    var page = getNearestPage(item);
    var pageParent = safeRead(page, "parent");
    if (pageParent && getClassName(pageParent) === "MasterSpread") {
        return pageParent;
    }

    return getNearestParentByClass(item, "MasterSpread");
}

function getNearestParentByClass(item, targetClassName) {
    var current = item;
    var guard = 0;

    while (current && guard < 30) {
        if (getClassName(current) === targetClassName) {
            return current;
        }
        current = safeRead(current, "parent");
        guard++;
    }

    return null;
}

function isInMasterContext(item) {
    return !!getNearestMasterSpread(item);
}

function findLockedParent(item) {
    var parent = safeRead(item, "parent");
    var guard = 0;

    while (parent && guard < 20) {
        if (safeRead(parent, "locked") === true) {
            return parent;
        }
        parent = safeRead(parent, "parent");
        guard++;
    }

    return null;
}

function describePage(page) {
    if (!page) {
        return "[无法读取]";
    }

    var text =
        describeObjectOneLine(page) +
        ", page.name=" +
        valueOrBlank(safeRead(page, "name"));

    var parent = safeRead(page, "parent");
    if (parent) {
        text += ", parent=" + describeObjectOneLine(parent);
    }

    return text;
}

function describeSpread(spread) {
    if (!spread) {
        return "[无法读取]";
    }
    return describeObjectOneLine(spread);
}

function describeObjectOneLine(obj) {
    if (obj === null || obj === undefined) {
        return "[无]";
    }

    var pieces = [];
    pieces.push(getClassName(obj));

    var name = safeRead(obj, "name");
    if (name !== null && name !== undefined && String(name) !== "") {
        pieces.push("name=\"" + String(name) + "\"");
    }

    var id = safeRead(obj, "id");
    if (id !== null && id !== undefined && String(id) !== "") {
        pieces.push("id=" + String(id));
    }

    var label = safeRead(obj, "label");
    if (label !== null && label !== undefined && String(label) !== "") {
        pieces.push("label=\"" + shortenText(String(label), 80) + "\"");
    }

    return pieces.join(" ");
}

function getDocumentOffsetText(page) {
    var offset = safeRead(page, "documentOffset");
    if (offset === null || offset === undefined || isNaN(Number(offset))) {
        return "";
    }
    return String(Number(offset) + 1);
}

function formatBounds(value) {
    if (!isArrayLike(value) || value.length < 4) {
        return makeSimpleValue(value);
    }

    var top = toNumber(value[0]);
    var left = toNumber(value[1]);
    var bottom = toNumber(value[2]);
    var right = toNumber(value[3]);

    if (top === null || left === null || bottom === null || right === null) {
        return makeSimpleValue(value);
    }

    return (
        "top=" +
        formatNumber(top) +
        ", left=" +
        formatNumber(left) +
        ", bottom=" +
        formatNumber(bottom) +
        ", right=" +
        formatNumber(right) +
        ", width=" +
        formatNumber(right - left) +
        ", height=" +
        formatNumber(bottom - top)
    );
}

function showReportDialog(reportText) {
    var dlg = new Window("dialog", "选中对象诊断");
    dlg.orientation = "column";
    dlg.alignChildren = "fill";
    dlg.margins = 16;
    dlg.spacing = 10;

    var reportBox = dlg.add("edittext", undefined, reportText, {
        multiline: true,
        scrolling: true
    });
    reportBox.preferredSize = [820, 560];
    reportBox.active = true;

    var statusText = dlg.add("statictext", undefined, " ");
    statusText.characters = 90;

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

    var tempFile = File(Folder.temp + "/indesign_selected_object_info.txt");
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

function hasMethod(obj, methodName) {
    if (obj === null || obj === undefined) {
        return false;
    }

    try {
        return typeof obj[methodName] === "function";
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

function getReflectPropertyNames(obj, limit) {
    var names = [];
    try {
        if (!obj || !obj.reflect || !obj.reflect.properties) {
            return names;
        }

        var properties = obj.reflect.properties;
        for (var i = 0; i < properties.length && names.length < limit; i++) {
            if (properties[i] && properties[i].name) {
                names.push(properties[i].name);
            }
        }
    } catch (error) {}

    return names;
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
            parts.push(formatPrimitive(value[i]));
        }
        return "[" + parts.join(", ") + "]";
    }

    return formatPrimitive(value);
}

function formatPrimitive(value) {
    if (value === null || value === undefined) {
        return "";
    }

    try {
        return String(value);
    } catch (error) {
        return "[无法转换为文字]";
    }
}

function valueOrBlank(value) {
    if (value === null || value === undefined || String(value) === "") {
        return "[空/无法读取]";
    }
    return makeSimpleValue(value);
}

function quotedOrBlank(value) {
    if (value === null || value === undefined || String(value) === "") {
        return "[空/无法读取]";
    }
    return "\"" + String(value) + "\"";
}

function shortenText(text, maxLength) {
    text = String(text)
        .replace(/\r/g, "\\r")
        .replace(/\n/g, "\\n")
        .replace(/\t/g, "\\t");

    if (text.length <= maxLength) {
        return text;
    }

    return text.substr(0, maxLength) + "...";
}

function repeat(text, count) {
    var out = "";
    for (var i = 0; i < count; i++) {
        out += text;
    }
    return out;
}

try {
    main();
} catch (err) {
    var lineText = err.line ? "\n\n行号：" + err.line : "";
    alert("检查选中对象失败：\n\n" + err.message + lineText);
}
