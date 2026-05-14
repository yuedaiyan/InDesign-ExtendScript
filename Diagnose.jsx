/**
 * Diagnose.jsx - 诊断脚本
 * 跨页选中两个组后运行,会列出每个组里的元素类型与数量
 */

(function () {
    if (app.documents.length === 0) {
        alert("请先打开文档");
        return;
    }
    var sel = app.selection;
    if (sel.length !== 2) {
        alert("当前选中数量: " + sel.length + ",请同时选中两个组");
        return;
    }

    var msg = "";
    for (var i = 0; i < 2; i++) {
        var s = sel[i];
        msg += "===== 选中对象 " + (i + 1) + " =====\n";
        msg += "构造名 (constructor): " + s.constructor.name + "\n";
        msg += "是 Group 吗: " + (s instanceof Group) + "\n";
        try {
            msg +=
                "所在页面: " +
                (s.parentPage ? s.parentPage.name : "(无,可能在粘贴板)") +
                "\n";
        } catch (e) {}

        if (s instanceof Group) {
            var items = s.pageItems;
            msg += "组内直接子元素数量: " + items.length + "\n";
            var typeCount = {};
            for (var k = 0; k < items.length; k++) {
                var t = items[k].constructor.name;
                typeCount[t] = (typeCount[t] || 0) + 1;
            }
            for (var key in typeCount) {
                msg += "  - " + key + ": " + typeCount[key] + "\n";
            }
        }
        msg += "\n";
    }
    alert(msg);
})();
