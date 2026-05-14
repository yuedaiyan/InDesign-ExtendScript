// AutoFillNumbers.jsx

(function () {
    if (app.documents.length === 0) {
        alert("请先打开文档");
        return;
    }

    var sel = app.selection;
    if (sel.length === 0) {
        alert("请选中一个文本框");
        return;
    }

    var frame = sel[0];

    if (
        frame.hasOwnProperty("parentTextFrames") &&
        frame.parentTextFrames.length > 0
    ) {
        frame = frame.parentTextFrames[0];
    }

    if (!(frame instanceof TextFrame)) {
        alert("请选中文本框");
        return;
    }

    var input = prompt("请输入要填充到几：", "20");

    if (input === null) {
        return;
    }

    var n = parseInt(input, 10);

    if (isNaN(n) || n < 1) {
        alert("请输入大于等于 1 的整数");
        return;
    }

    var arr = [];

    for (var i = 1; i <= n; i++) {
        arr.push(i);
    }

    frame.contents = arr.join("\r");
})();
