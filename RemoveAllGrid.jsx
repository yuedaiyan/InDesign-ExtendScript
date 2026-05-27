/*
  文件: RemoveAllGrid.jsx

  用途:
  - 删除当前活动文档中的全部参考线。

  使用前:
  - 打开要清理参考线的 InDesign 文档。
  - 确认确实要删除整个文档的所有 guides。

  运行流程:
  1. 运行脚本。
  2. 脚本统计当前文档参考线数量并弹出确认。
  3. 确认后删除全部参考线并报告数量。

  注意:
  - 删除动作包装为一次撤销操作。
  - 如果当前文档没有参考线，脚本只提示不修改。
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
