/**
 * BatchPlaceImages.jsx
 *
 * 批量将图片按文件名顺序置入当前文档的空白图片框
 */

(function () {
    var SUPPORTED_EXTENSIONS = [
        ".jpg",
        ".jpeg",
        ".png",
        ".tif",
        ".tiff",
        ".psd",
        ".pdf",
        ".ai",
        ".eps",
        ".gif",
    ];
    var ROW_TOLERANCE = 5;

    if (app.documents.length === 0) {
        alert("请先打开一个 InDesign 文档。");
        return;
    }
    var doc = app.activeDocument;

    function isEmptyGraphicFrame(item) {
        if (!item) return false;
        var typeName = item.constructor.name;
        if (
            typeName !== "Rectangle" &&
            typeName !== "Oval" &&
            typeName !== "Polygon"
        ) {
            return false;
        }
        if (item.graphics.length > 0) return false;
        try {
            if (item.contentType === ContentType.TEXT_TYPE) return false;
        } catch (e) {}
        try {
            if (item.parentStory && item.parentStory.characters.length > 0)
                return false;
        } catch (e) {}
        try {
            if (item.locked) return false;
            if (item.itemLayer.locked || !item.itemLayer.visible) return false;
        } catch (e) {}
        return true;
    }

    // ============ 改进的选择检测 ============
    var preSelectedFrame = null;
    var preSelectInfo = "";

    if (app.selection.length === 0) {
        preSelectInfo = "未选中任何对象";
    } else if (app.selection.length > 1) {
        preSelectInfo =
            "选中了 " + app.selection.length + " 个对象(需单选一个)";
    } else {
        var sel = app.selection[0];
        var selType = sel.constructor.name;

        if (
            selType === "Rectangle" ||
            selType === "Oval" ||
            selType === "Polygon"
        ) {
            preSelectedFrame = sel;
            preSelectInfo = "已选中 " + selType;
        } else if (
            selType === "Image" ||
            selType === "PDF" ||
            selType === "EPS" ||
            selType === "Graphic" ||
            selType === "WMF"
        ) {
            try {
                preSelectedFrame = sel.parent;
                preSelectInfo = "选中的是图片本身,已自动取其容器框";
            } catch (e) {
                preSelectInfo = "选中了图片但无法获取容器框";
            }
        } else if (selType === "Group") {
            preSelectInfo = "选中的是 Group(组),请双击进入组内选中具体的框";
        } else {
            preSelectInfo = "选中的是 " + selType + "(不是图片框)";
        }
    }

    // ============ 弹窗 ============
    var dialog = new Window("dialog", "批量置入图片");
    dialog.orientation = "column";
    dialog.alignChildren = "fill";

    var diagPanel = dialog.add("panel", undefined, "选择状态");
    diagPanel.margins = 10;
    diagPanel.alignChildren = "left";
    var diagText = diagPanel.add("statictext", undefined, "→ " + preSelectInfo);
    diagText.characters = 50;

    var radioGroup = dialog.add("panel", undefined, "起始位置");
    radioGroup.orientation = "column";
    radioGroup.alignChildren = "left";
    radioGroup.margins = 15;

    var rbA = radioGroup.add(
        "radiobutton",
        undefined,
        "从选中的图片框开始" + (preSelectedFrame ? " ✓" : "(不可用)"),
    );
    var rbB = radioGroup.add(
        "radiobutton",
        undefined,
        "从指定页码的第一个空白框开始",
    );
    var rbC = radioGroup.add(
        "radiobutton",
        undefined,
        "从文档第一个空白框开始",
    );

    var pageInputGroup = radioGroup.add("group");
    pageInputGroup.add("statictext", undefined, "    起始页码:");
    var pageInput = pageInputGroup.add("edittext", undefined, "1");
    pageInput.characters = 6;
    pageInput.enabled = false;

    // 显式互斥
    rbA.value = false;
    rbB.value = false;
    rbC.value = false;

    if (preSelectedFrame) {
        rbA.value = true;
    } else {
        rbA.enabled = false;
        rbC.value = true;
    }

    rbA.onClick = function () {
        pageInput.enabled = false;
    };
    rbB.onClick = function () {
        pageInput.enabled = true;
    };
    rbC.onClick = function () {
        pageInput.enabled = false;
    };

    var fitPanel = dialog.add("panel", undefined, "适配方式");
    fitPanel.orientation = "column";
    fitPanel.alignChildren = "left";
    fitPanel.margins = 15;

    var fitFill = fitPanel.add(
        "radiobutton",
        undefined,
        "按比例填充框(可能裁切边缘)",
    );
    var fitProp = fitPanel.add(
        "radiobutton",
        undefined,
        "按比例适合(完整显示,可能留白)",
    );
    fitFill.value = true;
    fitProp.value = false;

    var btnGroup = dialog.add("group");
    btnGroup.alignment = "right";
    btnGroup.add("button", undefined, "确定", { name: "ok" });
    btnGroup.add("button", undefined, "取消", { name: "cancel" });

    if (dialog.show() !== 1) return;

    var startMode = rbA.value ? "A" : rbB.value ? "B" : "C";
    var startPageNum = parseInt(pageInput.text, 10);
    var fitMode = fitFill.value
        ? FitOptions.FILL_PROPORTIONALLY
        : FitOptions.PROPORTIONALLY;

    if (
        startMode === "B" &&
        (isNaN(startPageNum) ||
            startPageNum < 1 ||
            startPageNum > doc.pages.length)
    ) {
        alert("页码无效。文档共 " + doc.pages.length + " 页。");
        return;
    }

    var folder = Folder.selectDialog("请选择存放图片的文件夹");
    if (folder === null) return;

    var allFiles = folder.getFiles();
    var imageFiles = [];
    for (var i = 0; i < allFiles.length; i++) {
        var f = allFiles[i];
        if (f instanceof File) {
            var name = f.name.toLowerCase();
            for (var j = 0; j < SUPPORTED_EXTENSIONS.length; j++) {
                if (
                    name.lastIndexOf(SUPPORTED_EXTENSIONS[j]) ===
                    name.length - SUPPORTED_EXTENSIONS[j].length
                ) {
                    imageFiles.push(f);
                    break;
                }
            }
        }
    }

    if (imageFiles.length === 0) {
        alert("所选文件夹内没有找到支持的图片文件。");
        return;
    }

    imageFiles.sort(function (a, b) {
        if (a.name < b.name) return -1;
        if (a.name > b.name) return 1;
        return 0;
    });

    var emptyFrames = [];

    for (var p = 0; p < doc.pages.length; p++) {
        var page = doc.pages[p];
        var pageFrames = [];

        var allItems = page.allPageItems;
        for (var k = 0; k < allItems.length; k++) {
            var item = allItems[k];
            if (isEmptyGraphicFrame(item)) {
                pageFrames.push(item);
            }
        }

        pageFrames.sort(function (a, b) {
            var ay = a.geometricBounds[0];
            var ax = a.geometricBounds[1];
            var by = b.geometricBounds[0];
            var bx = b.geometricBounds[1];

            if (Math.abs(ay - by) < ROW_TOLERANCE) {
                return ax - bx;
            }
            return ay - by;
        });

        for (var m = 0; m < pageFrames.length; m++) {
            emptyFrames.push(pageFrames[m]);
        }
    }

    if (emptyFrames.length === 0) {
        alert("当前文档中没有找到空白的图片框。");
        return;
    }

    var startIndex = 0;

    if (startMode === "A") {
        var foundA = -1;
        for (var sa = 0; sa < emptyFrames.length; sa++) {
            if (emptyFrames[sa] === preSelectedFrame) {
                foundA = sa;
                break;
            }
        }
        if (foundA === -1) {
            var diagMsg = "选中的图片框不在可用空白框列表中。\n\n";
            try {
                diagMsg +=
                    "选中框所在页:" + preSelectedFrame.parentPage.name + "\n";
            } catch (e) {
                diagMsg += "无法获取选中框所在页\n";
            }
            diagMsg += "类型:" + preSelectedFrame.constructor.name + "\n";
            diagMsg +=
                "graphics.length:" + preSelectedFrame.graphics.length + "\n";
            try {
                diagMsg += "contentType:" + preSelectedFrame.contentType + "\n";
            } catch (e) {}
            try {
                diagMsg += "locked:" + preSelectedFrame.locked + "\n";
            } catch (e) {}
            diagMsg +=
                "\n可能原因:已置入图片 / 是文本框 / 被锁定 / 所在图层锁定";
            alert(diagMsg);
            return;
        }
        startIndex = foundA;
    } else if (startMode === "B") {
        var targetPage = doc.pages[startPageNum - 1];
        var foundB = -1;
        for (var sb = 0; sb < emptyFrames.length; sb++) {
            try {
                if (emptyFrames[sb].parentPage === targetPage) {
                    foundB = sb;
                    break;
                }
            } catch (e) {}
        }
        if (foundB === -1) {
            alert("第 " + startPageNum + " 页没有找到空白图片框。");
            return;
        }
        startIndex = foundB;
    }

    var availableFrames = emptyFrames.length - startIndex;
    var placeCount = Math.min(imageFiles.length, availableFrames);
    var skippedFrames = startIndex;
    var trailingFrames = availableFrames - placeCount;

    var startFrameInfo = "";
    try {
        var sf = emptyFrames[startIndex];
        startFrameInfo = "起始框:第 " + sf.parentPage.name + " 页\n";
    } catch (e) {}

    var confirmMsg =
        "找到图片:" +
        imageFiles.length +
        " 张\n" +
        "找到空白图片框:" +
        emptyFrames.length +
        " 个\n" +
        startFrameInfo +
        "起始位置之前跳过:" +
        skippedFrames +
        " 个框\n" +
        "起始位置之后可用:" +
        availableFrames +
        " 个框\n" +
        "将置入:" +
        placeCount +
        " 张图片\n" +
        "起始位置后剩余空框:" +
        trailingFrames +
        " 个\n\n" +
        "是否继续?";

    if (!confirm(confirmMsg)) return;

    var successCount = 0;
    var failedList = [];

    app.doScript(
        function () {
            app.scriptPreferences.enableRedraw = false;
            try {
                for (var n = 0; n < placeCount; n++) {
                    var frame = emptyFrames[startIndex + n];
                    var imgFile = imageFiles[n];

                    try {
                        frame.place(imgFile);
                        if (frame.graphics.length > 0) {
                            frame.fit(fitMode);
                            if (fitMode === FitOptions.FILL_PROPORTIONALLY) {
                                frame.fit(FitOptions.CENTER_CONTENT);
                            }
                        }
                        successCount++;
                    } catch (err) {
                        failedList.push(imgFile.name + " → " + err.message);
                    }
                }
            } finally {
                app.scriptPreferences.enableRedraw = true;
            }
        },
        ScriptLanguage.JAVASCRIPT,
        undefined,
        UndoModes.ENTIRE_SCRIPT,
        "批量置入图片",
    );

    var report = "完成!\n\n成功置入:" + successCount + " 张\n";
    if (failedList.length > 0) {
        report += "失败:" + failedList.length + " 张\n\n失败列表:\n";
        var showCount = Math.min(failedList.length, 20);
        for (var q = 0; q < showCount; q++) {
            report += "• " + failedList[q] + "\n";
        }
        if (failedList.length > 20) {
            report += "... 还有 " + (failedList.length - 20) + " 条未显示";
        }
    }
    if (successCount > 0) {
        report += "\n💡 如需撤销,按一次 Cmd+Z 即可全部撤销。";
    }
    alert(report);
})();
