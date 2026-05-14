/*
  InDesign ExtendScript: inspect selected element properties

  Usage:
  1. Open an InDesign document.
  2. Select one page item, graphic, text frame, shape, or group.
  3. Run this script from InDesign's Scripts panel.
  4. A JSON-like report is saved next to this script when possible, otherwise
     on the Desktop. The report path is also shown in an alert.

  The report includes both a practical reconstruction section and a broader
  readable property dump. Some InDesign properties cannot be read safely from
  every object; those are recorded as "[Unreadable: ...]".
*/

(function () {
    if (app.documents.length === 0) {
        alert("请先打开一个 InDesign 文档。");
        return;
    }

    if (app.selection.length === 0) {
        alert("请先选中一个元素，再运行这个脚本。");
        return;
    }

    var doc = app.activeDocument;
    var items = app.selection;
    var report = {
        generatedAt: new Date().toString(),
        documentName: safeRead(doc, "name"),
        selectionCount: items.length,
        note: "items 是递归结构。reconstruction 里是更适合用另一个脚本复刻对象的关键属性；allReadableProperties 是尽量读取到的属性列表。",
        selectedItems: [],
    };

    for (var i = 0; i < items.length; i++) {
        report.selectedItems.push(
            inspectItem(items[i], i, "selection[" + i + "]", 0),
        );
    }

    var outputFile = getOutputFile("selected_element_properties.json");
    outputFile.encoding = "UTF-8";
    outputFile.open("w");
    outputFile.write(stringify(report, 0));
    outputFile.close();

    alert("已导出选中元素属性：\n" + outputFile.fsName);
})();

function inspectItem(item, index, hierarchyPath, depth) {
    var info = {
        selectionIndex: index,
        hierarchyPath: hierarchyPath,
        depth: depth,
        className: getClassName(item),
        objectSpecifier: safeToSpecifier(item),
        reconstruction: buildReconstructionData(item),
        allReadableProperties: dumpReadableProperties(item),
    };

    if (hasProperty(item, "pageItems")) {
        info.children = inspectChildren(item, hierarchyPath, depth);
    }

    return info;
}

function buildReconstructionData(item) {
    var data = {
        className: getClassName(item),
        name: safeRead(item, "name"),
        label: safeRead(item, "label"),
        id: safeRead(item, "id"),
        locked: safeRead(item, "locked"),
        visible: safeRead(item, "visible"),
        layerName: getLayerName(item),
        parentPageName: getParentPageName(item),
        geometricBounds: safeRead(item, "geometricBounds"),
        visibleBounds: safeRead(item, "visibleBounds"),
        strokeWeight: safeRead(item, "strokeWeight"),
        strokeColor: colorToObject(safeRead(item, "strokeColor")),
        fillColor: colorToObject(safeRead(item, "fillColor")),
        fillTint: safeRead(item, "fillTint"),
        strokeTint: safeRead(item, "strokeTint"),
        transparencySettings: inspectTransparency(item),
        rotationAngle: safeRead(item, "rotationAngle"),
        shearAngle: safeRead(item, "shearAngle"),
        horizontalScale: safeRead(item, "horizontalScale"),
        verticalScale: safeRead(item, "verticalScale"),
        absoluteRotationAngle: safeRead(item, "absoluteRotationAngle"),
        absoluteShearAngle: safeRead(item, "absoluteShearAngle"),
        frame: inspectFrame(item),
        paths: inspectPaths(item),
        text: inspectText(item),
        graphics: inspectGraphics(item),
        objectStyleName: getObjectStyleName(item),
    };

    if (hasProperty(item, "cornerOption")) {
        data.cornerOption = enumToString(safeRead(item, "cornerOption"));
        data.cornerRadius = safeRead(item, "cornerRadius");
    }

    return data;
}

function inspectPaths(item) {
    var paths = [];
    if (!hasProperty(item, "paths")) {
        return paths;
    }

    try {
        var itemPaths = safeRead(item, "paths");
        for (var i = 0; i < collectionLength(itemPaths); i++) {
            var path = itemPaths[i];
            var pathInfo = {
                pathType: enumToString(safeRead(path, "pathType")),
                entirePath: safeRead(path, "entirePath"),
                pathPoints: [],
            };

            try {
                var pathPoints = safeRead(path, "pathPoints");
                for (var j = 0; j < collectionLength(pathPoints); j++) {
                    var point = pathPoints[j];
                    pathInfo.pathPoints.push({
                        anchor: safeRead(point, "anchor"),
                        leftDirection: safeRead(point, "leftDirection"),
                        rightDirection: safeRead(point, "rightDirection"),
                        pointType: enumToString(safeRead(point, "pointType")),
                    });
                }
            } catch (pointError) {
                pathInfo.pathPointsError = String(pointError);
            }

            paths.push(pathInfo);
        }
    } catch (pathError) {
        paths.push("[Unreadable paths: " + String(pathError) + "]");
    }

    return paths;
}

function inspectText(item) {
    if (!hasProperty(item, "texts") && !hasProperty(item, "parentStory")) {
        return null;
    }

    try {
        var text = null;
        var itemTexts = safeRead(item, "texts");
        if (itemTexts !== null && collectionLength(itemTexts) > 0) {
            text = itemTexts[0];
        } else if (hasProperty(item, "parentStory")) {
            text = safeRead(item, "parentStory");
        }

        if (text === null) {
            return null;
        }

        return {
            contents: safeRead(text, "contents"),
            appliedFont: getName(safeRead(text, "appliedFont")),
            pointSize: safeRead(text, "pointSize"),
            leading: safeRead(text, "leading"),
            justification: enumToString(safeRead(text, "justification")),
            fillColor: colorToObject(safeRead(text, "fillColor")),
            strokeColor: colorToObject(safeRead(text, "strokeColor")),
            paragraphs: inspectParagraphs(text),
            textStyleRanges: inspectTextStyleRanges(text),
        };
    } catch (error) {
        return "[Unreadable text: " + String(error) + "]";
    }
}

function inspectParagraphs(text) {
    var paragraphs = [];
    if (!hasProperty(text, "paragraphs")) {
        return paragraphs;
    }

    try {
        var paragraphsCollection = safeRead(text, "paragraphs");
        var paragraphCount = collectionLength(paragraphsCollection);
        var limit = Math.min(paragraphCount, 200);
        for (var i = 0; i < limit; i++) {
            var paragraph = paragraphsCollection[i];
            paragraphs.push({
                paragraphIndex: i,
                contents: safeRead(paragraph, "contents"),
                appliedParagraphStyle: getName(
                    safeRead(paragraph, "appliedParagraphStyle"),
                ),
                justification: enumToString(
                    safeRead(paragraph, "justification"),
                ),
                pointSize: safeRead(paragraph, "pointSize"),
                leading: safeRead(paragraph, "leading"),
                firstLineIndent: safeRead(paragraph, "firstLineIndent"),
                leftIndent: safeRead(paragraph, "leftIndent"),
                rightIndent: safeRead(paragraph, "rightIndent"),
                spaceBefore: safeRead(paragraph, "spaceBefore"),
                spaceAfter: safeRead(paragraph, "spaceAfter"),
            });
        }
        if (paragraphCount > limit) {
            paragraphs.push(
                "[Truncated paragraphs, total length: " + paragraphCount + "]",
            );
        }
    } catch (error) {
        paragraphs.push("[Unreadable paragraphs: " + String(error) + "]");
    }

    return paragraphs;
}

function inspectTextStyleRanges(text) {
    var ranges = [];
    if (!hasProperty(text, "textStyleRanges")) {
        return ranges;
    }

    try {
        var rangeCollection = safeRead(text, "textStyleRanges");
        var rangeCount = collectionLength(rangeCollection);
        var limit = Math.min(rangeCount, 300);
        for (var i = 0; i < limit; i++) {
            var range = rangeCollection[i];
            ranges.push({
                rangeIndex: i,
                contents: safeRead(range, "contents"),
                appliedCharacterStyle: getName(
                    safeRead(range, "appliedCharacterStyle"),
                ),
                appliedFont: getName(safeRead(range, "appliedFont")),
                fontStyle: safeRead(range, "fontStyle"),
                pointSize: safeRead(range, "pointSize"),
                leading: safeRead(range, "leading"),
                tracking: safeRead(range, "tracking"),
                baselineShift: safeRead(range, "baselineShift"),
                capitalization: enumToString(safeRead(range, "capitalization")),
                fillColor: colorToObject(safeRead(range, "fillColor")),
                strokeColor: colorToObject(safeRead(range, "strokeColor")),
            });
        }
        if (rangeCount > limit) {
            ranges.push(
                "[Truncated textStyleRanges, total length: " + rangeCount + "]",
            );
        }
    } catch (error) {
        ranges.push("[Unreadable textStyleRanges: " + String(error) + "]");
    }

    return ranges;
}

function inspectFrame(item) {
    var frame = {
        contentType: enumToString(safeRead(item, "contentType")),
        fitting: inspectFrameFittingOptions(item),
        textFramePreferences: inspectTextFramePreferences(item),
        textWrapPreferences: inspectTextWrapPreferences(item),
    };

    if (
        !hasProperty(item, "contentType") &&
        frame.fitting === null &&
        frame.textFramePreferences === null &&
        frame.textWrapPreferences === null
    ) {
        return null;
    }

    return frame;
}

function inspectFrameFittingOptions(item) {
    if (!hasProperty(item, "frameFittingOptions")) {
        return null;
    }

    try {
        var options = safeRead(item, "frameFittingOptions");
        return {
            fittingOnEmptyFrame: enumToString(
                safeRead(options, "fittingOnEmptyFrame"),
            ),
            autoFit: safeRead(options, "autoFit"),
            cropAmount: safeRead(options, "cropAmount"),
            fittingAlignment: enumToString(
                safeRead(options, "fittingAlignment"),
            ),
        };
    } catch (error) {
        return "[Unreadable frameFittingOptions: " + String(error) + "]";
    }
}

function inspectTextFramePreferences(item) {
    if (!hasProperty(item, "textFramePreferences")) {
        return null;
    }

    try {
        var prefs = safeRead(item, "textFramePreferences");
        return {
            textColumnCount: safeRead(prefs, "textColumnCount"),
            textColumnGutter: safeRead(prefs, "textColumnGutter"),
            insetSpacing: safeRead(prefs, "insetSpacing"),
            verticalJustification: enumToString(
                safeRead(prefs, "verticalJustification"),
            ),
            firstBaselineOffset: enumToString(
                safeRead(prefs, "firstBaselineOffset"),
            ),
            minimumFirstBaselineOffset: safeRead(
                prefs,
                "minimumFirstBaselineOffset",
            ),
            ignoreWrap: safeRead(prefs, "ignoreWrap"),
        };
    } catch (error) {
        return "[Unreadable textFramePreferences: " + String(error) + "]";
    }
}

function inspectTextWrapPreferences(item) {
    if (!hasProperty(item, "textWrapPreferences")) {
        return null;
    }

    try {
        var prefs = safeRead(item, "textWrapPreferences");
        return {
            textWrapMode: enumToString(safeRead(prefs, "textWrapMode")),
            textWrapOffset: safeRead(prefs, "textWrapOffset"),
            inverse: safeRead(prefs, "inverse"),
        };
    } catch (error) {
        return "[Unreadable textWrapPreferences: " + String(error) + "]";
    }
}

function inspectGraphics(item) {
    var graphics = [];
    if (!hasProperty(item, "graphics")) {
        return graphics;
    }

    try {
        var itemGraphics = safeRead(item, "graphics");
        for (var i = 0; i < collectionLength(itemGraphics); i++) {
            var graphic = itemGraphics[i];
            graphics.push({
                className: getClassName(graphic),
                itemLinkName: getLinkName(graphic),
                geometricBounds: safeRead(graphic, "geometricBounds"),
                visibleBounds: safeRead(graphic, "visibleBounds"),
                horizontalScale: safeRead(graphic, "horizontalScale"),
                verticalScale: safeRead(graphic, "verticalScale"),
                actualPpi: safeRead(graphic, "actualPpi"),
                effectivePpi: safeRead(graphic, "effectivePpi"),
            });
        }
    } catch (error) {
        graphics.push("[Unreadable graphics: " + String(error) + "]");
    }

    return graphics;
}

function inspectTransparency(item) {
    if (!hasProperty(item, "transparencySettings")) {
        return null;
    }

    try {
        var settings = safeRead(item, "transparencySettings");
        var blending = safeRead(settings, "blendingSettings");
        return {
            opacity: safeRead(blending, "opacity"),
            blendMode: enumToString(safeRead(blending, "blendMode")),
        };
    } catch (error) {
        return "[Unreadable transparency: " + String(error) + "]";
    }
}

function inspectChildren(item, hierarchyPath, depth) {
    var children = [];
    try {
        var pageItems = safeRead(item, "pageItems");
        for (var i = 0; i < collectionLength(pageItems); i++) {
            children.push(
                inspectItem(
                    pageItems[i],
                    i,
                    hierarchyPath + ".pageItems[" + i + "]",
                    depth + 1,
                ),
            );
        }
    } catch (error) {
        children.push("[Unreadable children: " + String(error) + "]");
    }
    return children;
}

function dumpReadableProperties(item) {
    var preferred = [
        "constructor",
        "id",
        "index",
        "name",
        "label",
        "contents",
        "visible",
        "locked",
        "itemLayer",
        "parentPage",
        "parent",
        "geometricBounds",
        "visibleBounds",
        "bounds",
        "strokeWeight",
        "strokeAlignment",
        "strokeType",
        "strokeColor",
        "fillColor",
        "fillTint",
        "strokeTint",
        "overprintFill",
        "overprintStroke",
        "nonprinting",
        "rotationAngle",
        "shearAngle",
        "horizontalScale",
        "verticalScale",
        "absoluteRotationAngle",
        "absoluteShearAngle",
        "anchoredObjectSettings",
        "objectStyle",
        "textWrapPreferences",
        "transparencySettings",
        "frameFittingOptions",
        "paths",
        "graphics",
        "texts",
        "pageItems",
    ];
    var out = {};

    for (var i = 0; i < preferred.length; i++) {
        var key = preferred[i];
        if (hasProperty(item, key)) {
            out[key] = makeReadableValue(safeRead(item, key), 0);
        }
    }

    try {
        var reflectedProperties = item.reflect.properties;
        for (var r = 0; r < reflectedProperties.length; r++) {
            var reflectedKey = reflectedProperties[r].name;
            if (
                out[reflectedKey] === undefined &&
                hasProperty(item, reflectedKey)
            ) {
                out[reflectedKey] = makeReadableValue(
                    safeRead(item, reflectedKey),
                    0,
                );
            }
        }
    } catch (reflectionError) {
        out.reflectionError = String(reflectionError);
    }

    try {
        for (var prop in item) {
            if (out[prop] === undefined) {
                out[prop] = makeReadableValue(safeRead(item, prop), 0);
            }
        }
    } catch (error) {
        out.enumerationError = String(error);
    }

    return out;
}

function makeReadableValue(value, depth) {
    if (depth > 1) {
        return summarizeObject(value);
    }

    if (value === null || value === undefined) {
        return value;
    }

    var type = typeof value;
    if (type === "string" || type === "number" || type === "boolean") {
        return value;
    }

    if (isArrayLike(value)) {
        var arr = [];
        var limit = Math.min(value.length, 200);
        for (var i = 0; i < limit; i++) {
            try {
                arr.push(makeReadableValue(value[i], depth + 1));
            } catch (error) {
                arr.push("[Unreadable item: " + String(error) + "]");
            }
        }
        if (value.length > limit) {
            arr.push("[Truncated, total length: " + value.length + "]");
        }
        return arr;
    }

    return summarizeObject(value);
}

function summarizeObject(value) {
    if (value === null || value === undefined) {
        return value;
    }

    var summary = {
        className: getClassName(value),
        name: getName(value),
        value: enumToString(value),
    };

    var specifier = safeToSpecifier(value);
    if (specifier) {
        summary.objectSpecifier = specifier;
    }

    return summary;
}

function colorToObject(color) {
    if (color === null || color === undefined) {
        return color;
    }

    if (typeof color === "string") {
        return color;
    }

    var obj = {
        className: getClassName(color),
        name: readReflectedProperty(color, "name"),
        space: enumToString(readReflectedProperty(color, "space")),
        colorValue: readReflectedProperty(color, "colorValue"),
    };

    if (obj.name === undefined || obj.name === null || obj.name === "") {
        obj.value = enumToString(color);
    }

    return obj;
}

function safeRead(obj, prop) {
    if (obj === null || obj === undefined) {
        return null;
    }

    if (
        hasReflect(obj) &&
        prop !== "length" &&
        !reflectHasProperty(obj, prop)
    ) {
        return null;
    }

    try {
        return obj[prop];
    } catch (error) {
        return "[Unreadable " + prop + ": " + String(error) + "]";
    }
}

function readReflectedProperty(obj, prop) {
    return safeRead(obj, prop);
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
        if (!hasReflect(obj)) {
            return false;
        }

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

function hasProperty(obj, prop) {
    if (obj === null || obj === undefined) {
        return false;
    }

    if (hasReflect(obj)) {
        return reflectHasProperty(obj, prop);
    }

    try {
        var value = obj[prop];
        return value !== undefined;
    } catch (error) {
        return false;
    }
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
    return getName(safeRead(item, "parentPage"));
}

function getObjectStyleName(item) {
    var appliedObjectStyle = safeRead(item, "appliedObjectStyle");
    if (appliedObjectStyle !== null && appliedObjectStyle !== undefined) {
        return getName(appliedObjectStyle);
    }

    return getName(safeRead(item, "objectStyle"));
}

function getLinkName(graphic) {
    return getName(safeRead(graphic, "itemLink"));
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
        return value;
    }

    var type = typeof value;
    if (type === "string" || type === "number" || type === "boolean") {
        return value;
    }

    try {
        return String(value);
    } catch (error) {
        return "[Unreadable enum: " + String(error) + "]";
    }
}

function isArrayLike(value) {
    try {
        return (
            value &&
            typeof value !== "string" &&
            value.length !== undefined &&
            typeof value.length === "number"
        );
    } catch (error) {
        return false;
    }
}

function collectionLength(collection) {
    var length = safeRead(collection, "length");
    if (typeof length === "number") {
        return length;
    }
    return 0;
}

function getOutputFile(fileName) {
    try {
        if ($.fileName) {
            return File(File($.fileName).parent + "/" + fileName);
        }
    } catch (error) {}
    return File(Folder.desktop + "/" + fileName);
}

function stringify(value, indent) {
    var pad = repeat("  ", indent);
    var childPad = repeat("  ", indent + 1);

    if (value === null) {
        return "null";
    }

    if (value === undefined) {
        return "null";
    }

    var type = typeof value;

    if (type === "string") {
        return quote(value);
    }

    if (type === "number" || type === "boolean") {
        return String(value);
    }

    if (isArrayLike(value)) {
        var parts = [];
        for (var i = 0; i < value.length; i++) {
            parts.push(childPad + stringify(value[i], indent + 1));
        }
        if (parts.length === 0) {
            return "[]";
        }
        return "[\n" + parts.join(",\n") + "\n" + pad + "]";
    }

    var objectParts = [];
    for (var key in value) {
        if (value.hasOwnProperty(key)) {
            objectParts.push(
                childPad +
                    quote(key) +
                    ": " +
                    stringify(value[key], indent + 1),
            );
        }
    }

    if (objectParts.length === 0) {
        return "{}";
    }

    return "{\n" + objectParts.join(",\n") + "\n" + pad + "}";
}

function quote(text) {
    text = String(text);
    text = text.replace(/\\/g, "\\\\");
    text = text.replace(/"/g, '\\"');
    text = text.replace(/\r/g, "\\r");
    text = text.replace(/\n/g, "\\n");
    text = text.replace(/\t/g, "\\t");
    return '"' + text + '"';
}

function repeat(text, count) {
    var out = "";
    for (var i = 0; i < count; i++) {
        out += text;
    }
    return out;
}
