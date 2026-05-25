/* 
移除页面中所有的网格
*/

function main() {
    if (app.documents.length === 0) {
        alert("请先打开一个 InDesign 文档。");
        return;
    }

    var doc = app.activeDocument;
    var guideCount = doc.guides.length;

    if (guideCount === 0) {
        alert("当前文档没有参考线需要删除。");
        return;
    }

    var message =
        "当前文档共有 " + guideCount + " 条参考线。\n\n确定要全部删除吗？";
    if (!confirm(message)) {
        return;
    }

    app.doScript(
        function () {
            app.activeDocument.guides.everyItem().remove();
        },
        ScriptLanguage.JAVASCRIPT,
        undefined,
        UndoModes.ENTIRE_SCRIPT,
        "删除全部参考线",
    );

    alert("已删除 " + guideCount + " 条参考线。");
}

try {
    main();
} catch (err) {
    var lineText = err.line ? "\n\n行号：" + err.line : "";
    alert("删除参考线失败：\n\n" + err.message + lineText);
}
