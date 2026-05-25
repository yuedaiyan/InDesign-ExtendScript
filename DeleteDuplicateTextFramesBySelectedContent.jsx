// DeleteDuplicateTextFramesBySelectedContent.jsx

function main() {
    if (app.documents.length === 0) {
        alert("请先打开一个 InDesign 文档。");
        return;
    }

    var doc = app.activeDocument;
    var sourceFrame = getSelectedTextFrame();
    if (!sourceFrame) {
        alert("请先选中一个文本框。");
        return;
    }

    if (!isVisibleUnlockedTextFrame(sourceFrame)) {
        alert("选中的文本框不可见或已被锁定，脚本不会处理。");
        return;
    }

    var sourceText = safeContents(sourceFrame);
    var allFrames = collectDocumentTextFrames(doc);
    var duplicates = [];

    for (var i = 0; i < allFrames.length; i++) {
        var frame = allFrames[i];
        if (isSamePageItem(frame, sourceFrame)) continue;
        if (!isVisibleUnlockedTextFrame(frame)) continue;
        if (safeContents(frame) === sourceText) {
            duplicates.push(frame);
        }
    }

    if (duplicates.length === 0) {
        alert("没有找到其他内容完全相同、可见且未锁定的文本框。");
        return;
    }

    var previewText = sourceText;
    if (previewText.length > 120) {
        previewText = previewText.substr(0, 120) + "...";
    }
    if (previewText === "") previewText = "（空内容）";

    var message =
        "将删除其他内容完全相同的文本框：" +
        duplicates.length +
        " 个\n\n" +
        "匹配内容：\n" +
        previewText +
        "\n\n只会删除当前仍然可见且未锁定的文本框。\n\n确定继续吗？";

    if (!confirm(message)) return;

    var removedCount = 0;
    var skippedCount = 0;
    var failedMessages = [];

    app.doScript(
        function () {
            var oldRedraw = app.scriptPreferences.enableRedraw;
            app.scriptPreferences.enableRedraw = false;

            try {
                for (var j = 0; j < duplicates.length; j++) {
                    var duplicateFrame = duplicates[j];
                    if (!isVisibleUnlockedTextFrame(duplicateFrame)) {
                        skippedCount++;
                        continue;
                    }

                    try {
                        duplicateFrame.remove();
                        removedCount++;
                    } catch (removeError) {
                        failedMessages.push(
                            "第 " +
                                (j + 1) +
                                " 个文本框删除失败：" +
                                removeError.message
                        );
                    }
                }
            } finally {
                app.scriptPreferences.enableRedraw = oldRedraw;
            }
        },
        ScriptLanguage.JAVASCRIPT,
        undefined,
        UndoModes.ENTIRE_SCRIPT,
        "删除相同内容文本框"
    );

    var report = "完成。\n\n已删除文本框：" + removedCount + " 个";
    if (skippedCount > 0) {
        report += "\n跳过已变为不可见或锁定的文本框：" + skippedCount + " 个";
    }
    if (failedMessages.length > 0) {
        report += "\n\n以下文本框未能删除：\n" + failedMessages.join("\n");
    }

    alert(report);
}

function collectDocumentTextFrames(doc) {
    var result = [];
    var seen = {};

    appendTextFramesFromCollection(doc.textFrames, result, seen);

    try {
        for (var s = 0; s < doc.spreads.length; s++) {
            appendTextFramesFromCollection(doc.spreads[s].textFrames, result, seen);
        }
    } catch (e1) {}

    try {
        for (var p = 0; p < doc.pages.length; p++) {
            appendTextFramesFromCollection(doc.pages[p].textFrames, result, seen);
        }
    } catch (e2) {}

    try {
        for (var m = 0; m < doc.masterSpreads.length; m++) {
            appendTextFramesFromCollection(
                doc.masterSpreads[m].textFrames,
                result,
                seen
            );
        }
    } catch (e3) {}

    return result;
}

function appendTextFramesFromCollection(collection, result, seen) {
    if (!collection) return;

    try {
        var elements = collection.everyItem().getElements();
        for (var i = 0; i < elements.length; i++) {
            addTextFrame(elements[i], result, seen);
        }
        return;
    } catch (e1) {}

    try {
        for (var j = 0; j < collection.length; j++) {
            addTextFrame(collection[j], result, seen);
        }
    } catch (e2) {}
}

function addTextFrame(item, result, seen) {
    if (!isTextFrame(item)) return;

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
        var guard = 0;
        while (parent && guard < 30 && isValidItem(parent)) {
            guard++;
            if (isTextFrame(parent)) return parent;
            parent = parent.parent;
        }
    } catch (e2) {}

    return null;
}

function isVisibleUnlockedTextFrame(item) {
    if (!isTextFrame(item)) return false;
    if (isItemOrAncestorLocked(item)) return false;
    if (isItemOrAncestorHidden(item)) return false;
    return true;
}

function isItemOrAncestorLocked(item) {
    var current = item;
    var guard = 0;

    while (current && guard < 30) {
        guard++;

        try {
            if (current.locked === true) return true;
        } catch (e1) {}

        try {
            if (current.itemLayer && current.itemLayer.locked === true) return true;
        } catch (e2) {}

        try {
            current = current.parent;
        } catch (e3) {
            break;
        }
    }

    return false;
}

function isItemOrAncestorHidden(item) {
    var current = item;
    var guard = 0;

    while (current && guard < 30) {
        guard++;

        try {
            if (current.visible === false) return true;
        } catch (e1) {}

        try {
            if (current.itemLayer && current.itemLayer.visible === false) return true;
        } catch (e2) {}

        try {
            current = current.parent;
        } catch (e3) {
            break;
        }
    }

    return false;
}

function isSamePageItem(a, b) {
    if (!a || !b) return false;

    try {
        if (a === b) return true;
    } catch (e1) {}

    try {
        if (a.id !== undefined && b.id !== undefined && a.id === b.id) return true;
    } catch (e2) {}

    try {
        if (a.toSpecifier && b.toSpecifier && a.toSpecifier() === b.toSpecifier()) {
            return true;
        }
    } catch (e3) {}

    return false;
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

function getItemKey(item) {
    try {
        if (item.id !== undefined && item.id !== null) return "id:" + item.id;
    } catch (e1) {}

    try {
        if (item.toSpecifier) return "spec:" + item.toSpecifier();
    } catch (e2) {}

    return null;
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

try {
    main();
} catch (err) {
    var lineText = err.line ? "\n\n行号：" + err.line : "";
    alert("删除相同内容文本框失败：\n\n" + err.message + lineText);
}
