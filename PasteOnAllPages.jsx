// 把选中元素相对跨页原位置复制到其他跨页
// 跳过单页跨页（通常是首页和末页）

if (app.documents.length === 0) {
    alert("请先打开一个文档");
    exit();
}

var doc = app.activeDocument;
var sel = doc.selection;

if (sel.length === 0) {
    alert("请先选中至少一个元素");
    exit();
}

// 记录每个选中元素的位置（相对于其所在跨页的原点）
var items = [];
for (var i = 0; i < sel.length; i++) {
    var item = sel[i];
    if (!item.hasOwnProperty("geometricBounds")) continue;

    if (!item.parentPage) {
        alert(
            "有选中对象不在页面上，可能在粘贴板或主页上。请只选择页面上的对象。",
        );
        exit();
    }

    var sourceSpread = item.parentPage.parent;

    var topLeft = item.resolve(
        AnchorPoint.TOP_LEFT_ANCHOR,
        CoordinateSpaces.SPREAD_COORDINATES,
    )[0];

    items.push({
        item: item,
        spreadX: topLeft[0],
        spreadY: topLeft[1],
        sourceSpread: sourceSpread,
    });
}

if (items.length === 0) {
    alert("选中的对象不是可以复制的页面元素");
    exit();
}

// ========== 弹窗 UI ==========
var totalSpreads = doc.spreads.length;

var dialog = new Window("dialog", "原位粘贴到其他跨页");
dialog.orientation = "column";
dialog.alignChildren = "fill";
dialog.margins = 16;
dialog.spacing = 12;

var modePanel = dialog.add("panel", undefined, "选择模式");
modePanel.orientation = "column";
modePanel.alignChildren = "left";
modePanel.margins = 12;
modePanel.spacing = 6;

var rbAll = modePanel.add("radiobutton", undefined, "所有跨页");
var rbRange = modePanel.add("radiobutton", undefined, "指定跨页范围");
rbAll.value = true;

var rangeGroup = dialog.add("group");
rangeGroup.orientation = "row";
rangeGroup.spacing = 8;
rangeGroup.add("statictext", undefined, "跨页编号：");
var rangeInput = rangeGroup.add("edittext", undefined, "1-" + totalSpreads);
rangeInput.characters = 20;

var hint = dialog.add(
    "statictext",
    undefined,
    "格式示例：1-5, 8, 10-12（用英文逗号分隔）",
);
hint.graphics.foregroundColor = hint.graphics.newPen(
    hint.graphics.PenType.SOLID_COLOR,
    [0.5, 0.5, 0.5],
    1,
);

rangeGroup.enabled = false;

rbAll.onClick = function () {
    rangeGroup.enabled = false;
};
rbRange.onClick = function () {
    rangeGroup.enabled = true;
};

var infoText = dialog.add(
    "statictext",
    undefined,
    "说明：单页跨页（如首页/末页）会自动跳过。",
);
infoText.graphics.foregroundColor = infoText.graphics.newPen(
    infoText.graphics.PenType.SOLID_COLOR,
    [0.4, 0.4, 0.4],
    1,
);

var btnGroup = dialog.add("group");
btnGroup.alignment = "right";
btnGroup.add("button", undefined, "取消", { name: "cancel" });
btnGroup.add("button", undefined, "确定", { name: "ok" });

if (dialog.show() !== 1) exit();

// ========== 解析目标跨页 ==========
var targetSpreadIndices = [];

if (rbAll.value) {
    for (var s = 0; s < totalSpreads; s++) targetSpreadIndices.push(s);
} else {
    var rangeStr = rangeInput.text.replace(/\s/g, "");
    var parts = rangeStr.split(",");
    var seen = {};

    for (var i = 0; i < parts.length; i++) {
        var part = parts[i];
        if (part === "") continue;

        if (part.indexOf("-") !== -1) {
            var bb = part.split("-");
            var start = parseInt(bb[0], 10);
            var end = parseInt(bb[1], 10);

            if (isNaN(start) || isNaN(end)) {
                alert("格式错误：" + part);
                exit();
            }

            if (start > end) {
                var tmp = start;
                start = end;
                end = tmp;
            }

            for (var n = start; n <= end; n++) {
                if (n >= 1 && n <= totalSpreads && !seen[n]) {
                    targetSpreadIndices.push(n - 1);
                    seen[n] = true;
                }
            }
        } else {
            var n = parseInt(part, 10);

            if (isNaN(n)) {
                alert("格式错误：" + part);
                exit();
            }

            if (n >= 1 && n <= totalSpreads && !seen[n]) {
                targetSpreadIndices.push(n - 1);
                seen[n] = true;
            }
        }
    }

    if (targetSpreadIndices.length === 0) {
        alert("没有有效的目标跨页");
        exit();
    }
}

// ========== 执行复制 ==========
var result = { copied: 0, skippedSingle: 0, skippedSource: 0 };

app.doScript(
    function () {
        var sourcePageCount = items[0].sourceSpread.pages.length;

        for (var t = 0; t < targetSpreadIndices.length; t++) {
            var targetSpread = doc.spreads[targetSpreadIndices[t]];

            if (targetSpread.pages.length < sourcePageCount) {
                result.skippedSingle++;
                continue;
            }

            for (var k = 0; k < items.length; k++) {
                if (targetSpread === items[k].sourceSpread) {
                    if (k === 0) result.skippedSource++;
                    continue;
                }

                // 1. 先复制到目标跨页
                var dup = items[k].item.duplicate(targetSpread);

                // 2. 计算偏移并平移到原位置
                var currentTopLeft = dup.resolve(
                    AnchorPoint.TOP_LEFT_ANCHOR,
                    CoordinateSpaces.SPREAD_COORDINATES,
                )[0];

                var dx = items[k].spreadX - currentTopLeft[0];
                var dy = items[k].spreadY - currentTopLeft[1];

                dup.move(undefined, [dx, dy]);

                result.copied++;
            }
        }
    },
    ScriptLanguage.JAVASCRIPT,
    undefined,
    UndoModes.ENTIRE_SCRIPT,
    "原位粘贴到其他跨页",
);

alert(
    "完成！\n" +
        "复制了 " +
        result.copied +
        " 个元素\n" +
        "跳过单页跨页：" +
        result.skippedSingle +
        " 个\n" +
        "跳过原始跨页：" +
        result.skippedSource +
        " 个",
);
