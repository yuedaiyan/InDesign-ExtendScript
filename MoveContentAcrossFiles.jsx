// Copy Specific Layer Items From One InDesign Document To Another
// 从一个 InDesign 文件的指定图层，复制指定页码范围的内容到另一个文件的指定图层
// 适合：源文件和目标文件页面尺寸、页面结构基本一致的情况

(function () {
    // =========================
    // 你需要修改的配置
    // =========================

    // 是否运行时弹出设置窗口。改成 false 就会直接使用下面这些配置执行
    var SHOW_OPTIONS_DIALOG = true;

    // 源文件名称。留空 "" 表示使用当前激活的文件作为源文件
    var SOURCE_DOC_NAME = "";

    // 目标文件名称。必须写目标文件的完整文档名，例如 "target.indd"
    var TARGET_DOC_NAME = "c3_diary_event.indd";

    // 源文件中要复制的图层名称
    var SOURCE_LAYER_NAME = "body_img";

    // 目标文件中要粘贴到的图层名称
    var TARGET_LAYER_NAME = "body_img";

    // 源文件从第几页开始复制
    var SOURCE_START_PAGE = 2;

    // 目标文件从第几页开始粘贴
    var TARGET_START_PAGE = 224;

    // 一共复制多少页
    var PAGE_COUNT = 108;

    // 是否自动创建目标图层
    var CREATE_TARGET_LAYER_IF_MISSING = false;

    // 是否跳过单页跨页，通常首页、末页可能是单页
    // 如果你不想跳过，改成 false
    var SKIP_SINGLE_PAGE_SPREADS = false;

    // =========================
    // 主逻辑
    // =========================

    try {
        main();
    } catch (err) {
        var lineText = err && err.line ? "\n行号：" + err.line : "";
        alert("脚本出错：\n\n" + err.message + lineText);
    } finally {
        try {
            app.select(null);
        } catch (e3) {}
    }

    function main() {
        if (app.documents.length < 2) {
            alert("请至少打开两个 InDesign 文件：源文件和目标文件。");
            return;
        }

        if (SHOW_OPTIONS_DIALOG && !askOptions()) {
            return;
        }

        if (
            TARGET_DOC_NAME === "" ||
            SOURCE_LAYER_NAME === "" ||
            TARGET_LAYER_NAME === ""
        ) {
            alert("参数不能为空：目标文件名、源图层名、目标图层名都必须填写。");
            return;
        }

        var sourceDoc = getDocumentByName(SOURCE_DOC_NAME);
        var targetDoc = getDocumentByName(TARGET_DOC_NAME);

        if (!sourceDoc) {
            alert(
                "找不到源文件。请检查 SOURCE_DOC_NAME，或者让源文件处于当前激活状态。",
            );
            return;
        }

        if (!targetDoc) {
            alert("找不到目标文件：" + TARGET_DOC_NAME);
            return;
        }

        if (sourceDoc === targetDoc) {
            alert("源文件和目标文件不能是同一个文档。");
            return;
        }

        var sourceLayer = getLayerByName(sourceDoc, SOURCE_LAYER_NAME);
        if (!sourceLayer) {
            alert("源文件中找不到图层：" + SOURCE_LAYER_NAME);
            return;
        }

        var targetLayer = getLayerByName(targetDoc, TARGET_LAYER_NAME);
        if (!targetLayer && !CREATE_TARGET_LAYER_IF_MISSING) {
            alert("目标文件中找不到图层：" + TARGET_LAYER_NAME);
            return;
        }

        if (
            !hasPageValue(SOURCE_START_PAGE) ||
            !hasPageValue(TARGET_START_PAGE) ||
            !isPositiveInteger(PAGE_COUNT)
        ) {
            alert(
                "页码参数错误：SOURCE_START_PAGE 和 TARGET_START_PAGE 不能为空；PAGE_COUNT 必须是大于等于 1 的整数。",
            );
            return;
        }

        var pagePlan = buildPagePlan(sourceDoc, targetDoc);
        if (!pagePlan.ok) {
            alert(pagePlan.message);
            return;
        }

        var result = {
            copiedCount: 0,
            skippedPageCount: 0,
            failed: [],
        };

        app.doScript(
            function () {
                var oldRedraw = app.scriptPreferences.enableRedraw;
                app.scriptPreferences.enableRedraw = false;

                var sourceLayerState = rememberLayerState(sourceLayer);
                var targetLayerState = targetLayer
                    ? rememberLayerState(targetLayer)
                    : null;

                try {
                    if (!targetLayer && CREATE_TARGET_LAYER_IF_MISSING) {
                        targetLayer = targetDoc.layers.add({
                            name: TARGET_LAYER_NAME,
                        });
                    }

                    unlockLayer(sourceLayer);
                    unlockLayer(targetLayer);
                    copyByPagePlan(pagePlan, sourceLayer, targetLayer, result);
                } finally {
                    restoreLayerState(targetLayerState);
                    restoreLayerState(sourceLayerState);
                    app.scriptPreferences.enableRedraw = oldRedraw;
                }
            },
            ScriptLanguage.JAVASCRIPT,
            undefined,
            UndoModes.ENTIRE_SCRIPT,
            "跨文件复制指定图层内容",
        );

        alert(buildFinalReport(sourceDoc, targetDoc, pagePlan, result));
    }

    function buildPagePlan(sourceDoc, targetDoc) {
        var sourceStartIndex = findPageIndex(sourceDoc, SOURCE_START_PAGE);
        if (sourceStartIndex < 0) {
            return {
                ok: false,
                message:
                    "找不到源文件起始页：" +
                    SOURCE_START_PAGE +
                    "\n\n脚本会优先匹配 InDesign 页码面板里的显示页码；如果找不到，再按文档物理页序号匹配。",
            };
        }

        var targetStartIndex = findPageIndex(targetDoc, TARGET_START_PAGE);
        if (targetStartIndex < 0) {
            return {
                ok: false,
                message:
                    "找不到目标文件起始页：" +
                    TARGET_START_PAGE +
                    "\n\n脚本会优先匹配 InDesign 页码面板里的显示页码；如果找不到，再按文档物理页序号匹配。",
            };
        }

        var sourceEndIndex = sourceStartIndex + PAGE_COUNT - 1;
        if (sourceEndIndex >= sourceDoc.pages.length) {
            return {
                ok: false,
                message:
                    "源文件页码范围超出。\n\n" +
                    "源文件总页数：" +
                    sourceDoc.pages.length +
                    "\n" +
                    "起始页：" +
                    SOURCE_START_PAGE +
                    "\n" +
                    "一共复制页数：" +
                    PAGE_COUNT,
            };
        }

        var targetEndIndex = targetStartIndex + PAGE_COUNT - 1;
        if (targetEndIndex >= targetDoc.pages.length) {
            return {
                ok: false,
                message:
                    "目标文件页码范围超出。\n\n" +
                    "目标文件总页数：" +
                    targetDoc.pages.length +
                    "\n" +
                    "起始页：" +
                    TARGET_START_PAGE +
                    "\n" +
                    "一共粘贴页数：" +
                    PAGE_COUNT,
            };
        }

        var pairs = [];
        for (var offset = 0; offset < PAGE_COUNT; offset++) {
            pairs.push({
                sourcePage: sourceDoc.pages[sourceStartIndex + offset],
                targetPage: targetDoc.pages[targetStartIndex + offset],
            });
        }

        return {
            ok: true,
            sourceStartPage: sourceDoc.pages[sourceStartIndex],
            sourceEndPage: sourceDoc.pages[sourceEndIndex],
            targetStartPage: targetDoc.pages[targetStartIndex],
            targetEndPage: targetDoc.pages[targetEndIndex],
            pairs: pairs,
        };
    }

    // =========================
    // 工具函数
    // =========================

    function askOptions() {
        var dialog = new Window("dialog", "跨文件复制指定图层内容");
        dialog.orientation = "column";
        dialog.alignChildren = "fill";
        dialog.margins = 16;
        dialog.spacing = 10;

        var sourceDocGroup = dialog.add("group");
        sourceDocGroup.orientation = "row";
        sourceDocGroup.spacing = 8;
        sourceDocGroup.add("statictext", undefined, "源文件名：");
        var sourceDocInput = sourceDocGroup.add(
            "edittext",
            undefined,
            SOURCE_DOC_NAME,
        );
        sourceDocInput.characters = 34;

        var sourceHint = dialog.add(
            "statictext",
            undefined,
            "源文件名留空时，使用当前激活的 InDesign 文件。目标文件名必须完整匹配。",
        );
        sourceHint.graphics.foregroundColor = sourceHint.graphics.newPen(
            sourceHint.graphics.PenType.SOLID_COLOR,
            [0.5, 0.5, 0.5],
            1,
        );

        var targetDocGroup = dialog.add("group");
        targetDocGroup.orientation = "row";
        targetDocGroup.spacing = 8;
        targetDocGroup.add("statictext", undefined, "目标文件名：");
        var targetDocInput = targetDocGroup.add(
            "edittext",
            undefined,
            TARGET_DOC_NAME,
        );
        targetDocInput.characters = 34;

        var sourceLayerGroup = dialog.add("group");
        sourceLayerGroup.orientation = "row";
        sourceLayerGroup.spacing = 8;
        sourceLayerGroup.add("statictext", undefined, "源图层名：");
        var sourceLayerInput = sourceLayerGroup.add(
            "edittext",
            undefined,
            SOURCE_LAYER_NAME,
        );
        sourceLayerInput.characters = 34;

        var targetLayerGroup = dialog.add("group");
        targetLayerGroup.orientation = "row";
        targetLayerGroup.spacing = 8;
        targetLayerGroup.add("statictext", undefined, "目标图层名：");
        var targetLayerInput = targetLayerGroup.add(
            "edittext",
            undefined,
            TARGET_LAYER_NAME,
        );
        targetLayerInput.characters = 34;

        var pageGroup = dialog.add("group");
        pageGroup.orientation = "row";
        pageGroup.spacing = 8;
        pageGroup.add("statictext", undefined, "源起始页：");
        var sourcePageInput = pageGroup.add(
            "edittext",
            undefined,
            String(SOURCE_START_PAGE),
        );
        sourcePageInput.characters = 8;
        pageGroup.add("statictext", undefined, "目标起始页：");
        var targetPageInput = pageGroup.add(
            "edittext",
            undefined,
            String(TARGET_START_PAGE),
        );
        targetPageInput.characters = 8;
        pageGroup.add("statictext", undefined, "页数：");
        var pageCountInput = pageGroup.add(
            "edittext",
            undefined,
            String(PAGE_COUNT),
        );
        pageCountInput.characters = 6;

        var pageHint = dialog.add(
            "statictext",
            undefined,
            "页码会优先匹配 InDesign 页码面板里的显示页码，例如 224 或 A-1。",
        );
        pageHint.graphics.foregroundColor = pageHint.graphics.newPen(
            pageHint.graphics.PenType.SOLID_COLOR,
            [0.5, 0.5, 0.5],
            1,
        );

        var createLayerCheckbox = dialog.add(
            "checkbox",
            undefined,
            "目标图层不存在时自动创建",
        );
        createLayerCheckbox.value = CREATE_TARGET_LAYER_IF_MISSING;

        var skipSingleCheckbox = dialog.add(
            "checkbox",
            undefined,
            "跳过单页跨页",
        );
        skipSingleCheckbox.value = SKIP_SINGLE_PAGE_SPREADS;

        var btnGroup = dialog.add("group");
        btnGroup.alignment = "right";
        btnGroup.add("button", undefined, "取消", { name: "cancel" });
        btnGroup.add("button", undefined, "执行", { name: "ok" });

        if (dialog.show() !== 1) return false;

        SOURCE_DOC_NAME = trimText(sourceDocInput.text);
        TARGET_DOC_NAME = trimText(targetDocInput.text);
        SOURCE_LAYER_NAME = trimText(sourceLayerInput.text);
        TARGET_LAYER_NAME = trimText(targetLayerInput.text);
        SOURCE_START_PAGE = trimText(sourcePageInput.text);
        TARGET_START_PAGE = trimText(targetPageInput.text);
        PAGE_COUNT = Number(trimText(pageCountInput.text));
        CREATE_TARGET_LAYER_IF_MISSING = createLayerCheckbox.value;
        SKIP_SINGLE_PAGE_SPREADS = skipSingleCheckbox.value;

        return true;
    }

    function getDocumentByName(docName) {
        if (docName === "") {
            return app.activeDocument;
        }

        for (var i = 0; i < app.documents.length; i++) {
            if (app.documents[i].name === docName) {
                return app.documents[i];
            }
        }

        return null;
    }

    function getLayerByName(doc, layerName) {
        for (var i = 0; i < doc.layers.length; i++) {
            if (doc.layers[i].name === layerName) {
                return doc.layers[i];
            }
        }

        return null;
    }

    function findPageIndex(doc, pageNumber) {
        var pageName = String(pageNumber);
        for (var i = 0; i < doc.pages.length; i++) {
            if (String(doc.pages[i].name) === pageName) {
                return i;
            }
        }

        var physicalIndex = Number(pageNumber) - 1;
        if (physicalIndex >= 0 && physicalIndex < doc.pages.length) {
            return physicalIndex;
        }

        return -1;
    }

    function hasPageValue(value) {
        return trimText(value) !== "";
    }

    function isPositiveInteger(value) {
        return (
            Number(value) === Math.floor(Number(value)) && Number(value) >= 1
        );
    }

    function trimText(value) {
        return String(value).replace(/^\s+|\s+$/g, "");
    }

    function copyByPagePlan(pagePlan, sourceLayer, targetLayer, result) {
        for (var offset = 0; offset < pagePlan.pairs.length; offset++) {
            var sourcePage = pagePlan.pairs[offset].sourcePage;
            var targetPage = pagePlan.pairs[offset].targetPage;

            if (
                SKIP_SINGLE_PAGE_SPREADS &&
                sourcePage.parent.pages.length === 1
            ) {
                result.skippedPageCount++;
                continue;
            }

            var itemsToCopy = getTopLevelPageItemsOnLayer(
                sourcePage,
                sourceLayer,
            );
            for (
                var itemIndex = 0;
                itemIndex < itemsToCopy.length;
                itemIndex++
            ) {
                duplicateOneItem(
                    itemsToCopy[itemIndex],
                    sourcePage,
                    targetPage,
                    targetLayer,
                    result,
                );
            }
        }
    }

    function duplicateOneItem(
        sourceItem,
        sourcePage,
        targetPage,
        targetLayer,
        result,
    ) {
        try {
            var duplicatedItem = sourceItem.duplicate(targetPage);
            duplicatedItem.itemLayer = targetLayer;
            result.copiedCount++;
        } catch (dupErr) {
            result.failed.push(
                "源页 " +
                    getPageName(sourcePage) +
                    " -> 目标页 " +
                    getPageName(targetPage) +
                    "，对象 " +
                    getItemName(sourceItem) +
                    "： " +
                    getErrorMessage(dupErr),
            );
        }
    }

    function rememberLayerState(layer) {
        if (!layer || !layer.isValid) return null;

        return {
            layer: layer,
            locked: safeRead(layer, "locked"),
            visible: safeRead(layer, "visible"),
        };
    }

    function restoreLayerState(state) {
        if (!state || !state.layer || !state.layer.isValid) return;

        try {
            if (state.visible !== null) state.layer.visible = state.visible;
        } catch (e1) {}

        try {
            if (state.locked !== null) state.layer.locked = state.locked;
        } catch (e2) {}
    }

    function unlockLayer(layer) {
        if (!layer || !layer.isValid) return;

        try {
            layer.locked = false;
        } catch (e1) {}

        try {
            layer.visible = true;
        } catch (e2) {}
    }

    function getTopLevelPageItemsOnLayer(page, layer) {
        var result = [];

        // page.pageItems 通常只拿当前页面上的顶层对象
        // 避免 allPageItems 把组内对象也单独拿出来，导致重复复制
        for (var i = 0; i < page.pageItems.length; i++) {
            var item = page.pageItems[i];

            try {
                if (!item.isValid) continue;
                if (item.itemLayer !== layer) continue;

                // 排除被锁定对象
                if (item.locked) continue;

                result.push(item);
            } catch (e) {
                // 某些特殊对象可能访问属性时报错，跳过
            }
        }

        return result;
    }

    function buildFinalReport(sourceDoc, targetDoc, pagePlan, result) {
        var report =
            "复制完成。\n\n" +
            "源文件：" +
            sourceDoc.name +
            "\n" +
            "目标文件：" +
            targetDoc.name +
            "\n" +
            "源图层：" +
            SOURCE_LAYER_NAME +
            "\n" +
            "目标图层：" +
            TARGET_LAYER_NAME +
            "\n\n" +
            "源文件页码范围：" +
            getPageName(pagePlan.sourceStartPage) +
            " - " +
            getPageName(pagePlan.sourceEndPage) +
            "\n" +
            "目标文件页码范围：" +
            getPageName(pagePlan.targetStartPage) +
            " - " +
            getPageName(pagePlan.targetEndPage) +
            "\n\n" +
            "复制对象数量：" +
            result.copiedCount +
            "\n" +
            "跳过页面数量：" +
            result.skippedPageCount;

        if (result.failed.length > 0) {
            report += "\n\n复制失败对象：" + result.failed.length + " 个\n";
            var showCount = Math.min(result.failed.length, 20);
            for (var i = 0; i < showCount; i++) {
                report += "- " + result.failed[i] + "\n";
            }
            if (result.failed.length > 20) {
                report +=
                    "... 还有 " + (result.failed.length - 20) + " 个未显示\n";
            }
        }

        report += "\n需要撤销时，按一次 Cmd+Z 即可撤销本次全部复制。";
        return report;
    }

    function getPageName(page) {
        try {
            return page.name;
        } catch (e) {
            return "[未知页]";
        }
    }

    function getItemName(item) {
        try {
            if (item.name) return '"' + item.name + '"';
        } catch (e1) {}

        try {
            return "[" + item.constructor.name + "]";
        } catch (e2) {
            return "[未知对象]";
        }
    }

    function safeRead(obj, propName) {
        try {
            return obj[propName];
        } catch (e) {
            return null;
        }
    }

    function getErrorMessage(err) {
        if (err && err.message) return err.message;
        return String(err);
    }
})();
