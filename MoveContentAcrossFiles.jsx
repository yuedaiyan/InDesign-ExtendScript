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
    // var SOURCE_DOC_NAME = "";
    var SOURCE_DOC_NAME = "try_blurred.indd";

    // 目标文件名称。必须写目标文件的完整文档名，例如 "target.indd"
    var TARGET_DOC_NAME = "c1_me.indd";

    // 源文件中要复制的图层名称列表。多个图层可用逗号或换行分隔
    var SOURCE_LAYER_NAMES = "body_other,body_img";
    // var SOURCE_LAYER_NAMES = "body_other\nbody_img";

    // 目标文件中要粘贴到的图层名称列表。数量和顺序必须与源图层列表一一对应
    var TARGET_LAYER_NAMES = "body_other,body_img";
    // var TARGET_LAYER_NAMES = "body_other\nbody_img";

    // 源文件从哪一页开始复制
    var SOURCE_START_PAGE = 162;

    // 源文件复制到哪一页结束。脚本会根据起始页和结束页自动计算页数
    var SOURCE_END_PAGE = 175;

    // 目标文件从第几页开始粘贴
    var TARGET_START_PAGE = 78;

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
            SOURCE_LAYER_NAMES === "" ||
            TARGET_LAYER_NAMES === ""
        ) {
            alert(
                "参数不能为空：目标文件名、源图层列表、目标图层列表都必须填写。",
            );
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

        var layerPairsResult = buildLayerPairs(sourceDoc, targetDoc);
        if (!layerPairsResult.ok) {
            alert(layerPairsResult.message);
            return;
        }
        var layerPairs = layerPairsResult.layerPairs;

        if (
            !hasPageValue(SOURCE_START_PAGE) ||
            !hasPageValue(SOURCE_END_PAGE) ||
            !hasPageValue(TARGET_START_PAGE)
        ) {
            alert(
                "页码参数错误：SOURCE_START_PAGE、SOURCE_END_PAGE 和 TARGET_START_PAGE 都不能为空。",
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
            layerStats: [],
        };

        app.doScript(
            function () {
                var oldRedraw = app.scriptPreferences.enableRedraw;
                app.scriptPreferences.enableRedraw = false;

                var layerStates = rememberLayerStates(layerPairs);

                try {
                    prepareLayerPairs(targetDoc, layerPairs);
                    copyByPagePlan(pagePlan, layerPairs, result);
                } finally {
                    restoreLayerStates(layerStates);
                    app.scriptPreferences.enableRedraw = oldRedraw;
                }
            },
            ScriptLanguage.JAVASCRIPT,
            undefined,
            UndoModes.ENTIRE_SCRIPT,
            "跨文件复制指定图层内容",
        );

        alert(
            buildFinalReport(
                sourceDoc,
                targetDoc,
                pagePlan,
                layerPairs,
                result,
            ),
        );
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

        var sourceEndIndex = findPageIndex(sourceDoc, SOURCE_END_PAGE);
        if (sourceEndIndex < 0) {
            return {
                ok: false,
                message:
                    "找不到源文件结束页：" +
                    SOURCE_END_PAGE +
                    "\n\n脚本会优先匹配 InDesign 页码面板里的显示页码；如果找不到，再按文档物理页序号匹配。",
            };
        }

        if (sourceEndIndex < sourceStartIndex) {
            return {
                ok: false,
                message:
                    "源文件页码范围错误。\n\n" +
                    "源起始页：" +
                    getPageName(sourceDoc.pages[sourceStartIndex]) +
                    "\n" +
                    "源结束页：" +
                    getPageName(sourceDoc.pages[sourceEndIndex]) +
                    "\n\n结束页不能排在起始页前面。",
            };
        }

        var pageCount = sourceEndIndex - sourceStartIndex + 1;

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

        var targetEndIndex = targetStartIndex + pageCount - 1;
        if (targetEndIndex >= targetDoc.pages.length) {
            var availableTargetCount =
                targetDoc.pages.length - targetStartIndex;
            return {
                ok: false,
                message:
                    "目标文件页码范围超出。\n\n" +
                    "目标文件：" +
                    targetDoc.name +
                    "\n" +
                    "目标文件总页数：" +
                    targetDoc.pages.length +
                    "\n" +
                    "匹配到的起始页：" +
                    getPageName(targetDoc.pages[targetStartIndex]) +
                    "\n" +
                    "目标文件最后一页：" +
                    getPageName(targetDoc.pages[targetDoc.pages.length - 1]) +
                    "\n" +
                    "你要求粘贴页数：" +
                    pageCount +
                    "\n" +
                    "从这个起点最多可粘贴：" +
                    availableTargetCount +
                    " 页",
            };
        }

        var pairs = [];
        for (var offset = 0; offset < pageCount; offset++) {
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
            pageCount: pageCount,
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
            "源文件名留空时，使用当前激活文件：" + getActiveDocumentSummary(),
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

        var layerGroup = dialog.add("group");
        layerGroup.orientation = "row";
        layerGroup.alignChildren = "top";
        layerGroup.spacing = 12;

        var sourceLayerGroup = layerGroup.add("group");
        sourceLayerGroup.orientation = "column";
        sourceLayerGroup.alignChildren = "fill";
        sourceLayerGroup.spacing = 4;
        sourceLayerGroup.add("statictext", undefined, "源图层列表：");
        var sourceLayerInput = sourceLayerGroup.add(
            "edittext",
            undefined,
            SOURCE_LAYER_NAMES,
            { multiline: true, scrolling: true },
        );
        sourceLayerInput.characters = 28;
        sourceLayerInput.preferredSize.height = 82;

        var targetLayerGroup = layerGroup.add("group");
        targetLayerGroup.orientation = "column";
        targetLayerGroup.alignChildren = "fill";
        targetLayerGroup.spacing = 4;
        targetLayerGroup.add("statictext", undefined, "目标图层列表：");
        var targetLayerInput = targetLayerGroup.add(
            "edittext",
            undefined,
            TARGET_LAYER_NAMES,
            { multiline: true, scrolling: true },
        );
        targetLayerInput.characters = 28;
        targetLayerInput.preferredSize.height = 82;

        var layerHint = dialog.add(
            "statictext",
            undefined,
            "源图层和目标图层按顺序一一对应；每行一个图层，也可以用逗号或分号分隔。",
        );
        layerHint.graphics.foregroundColor = layerHint.graphics.newPen(
            layerHint.graphics.PenType.SOLID_COLOR,
            [0.5, 0.5, 0.5],
            1,
        );

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
        pageGroup.add("statictext", undefined, "源结束页：");
        var sourceEndPageInput = pageGroup.add(
            "edittext",
            undefined,
            String(SOURCE_END_PAGE),
        );
        sourceEndPageInput.characters = 8;
        pageGroup.add("statictext", undefined, "目标起始页：");
        var targetPageInput = pageGroup.add(
            "edittext",
            undefined,
            String(TARGET_START_PAGE),
        );
        targetPageInput.characters = 8;

        var pageHint = dialog.add(
            "statictext",
            undefined,
            "页码会优先匹配 InDesign 页码面板里的显示页码；复制页数会由源起始页和源结束页自动计算。",
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
        SOURCE_LAYER_NAMES = trimText(sourceLayerInput.text);
        TARGET_LAYER_NAMES = trimText(targetLayerInput.text);
        SOURCE_START_PAGE = trimText(sourcePageInput.text);
        SOURCE_END_PAGE = trimText(sourceEndPageInput.text);
        TARGET_START_PAGE = trimText(targetPageInput.text);
        CREATE_TARGET_LAYER_IF_MISSING = createLayerCheckbox.value;
        SKIP_SINGLE_PAGE_SPREADS = skipSingleCheckbox.value;

        return true;
    }

    function getActiveDocumentSummary() {
        try {
            var doc = app.activeDocument;
            return (
                doc.name +
                "（" +
                getPageName(doc.pages[0]) +
                "-" +
                getPageName(doc.pages[doc.pages.length - 1]) +
                "）"
            );
        } catch (e) {
            return "当前文件";
        }
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

    function buildLayerPairs(sourceDoc, targetDoc) {
        var sourceNames = parseLayerNames(SOURCE_LAYER_NAMES);
        var targetNames = parseLayerNames(TARGET_LAYER_NAMES);

        if (sourceNames.length === 0 || targetNames.length === 0) {
            return {
                ok: false,
                message: "源图层列表和目标图层列表都至少要有一个图层。",
            };
        }

        if (sourceNames.length !== targetNames.length) {
            return {
                ok: false,
                message:
                    "源图层和目标图层数量不一致。\n\n" +
                    "源图层数量：" +
                    sourceNames.length +
                    "\n" +
                    "目标图层数量：" +
                    targetNames.length +
                    "\n\n请让两边列表一一对应。",
            };
        }

        var layerPairs = [];
        var missingSource = [];
        var missingTarget = [];

        for (var i = 0; i < sourceNames.length; i++) {
            var sourceLayer = getLayerByName(sourceDoc, sourceNames[i]);
            if (!sourceLayer) {
                missingSource.push(sourceNames[i]);
                continue;
            }

            var targetLayer = getLayerByName(targetDoc, targetNames[i]);
            if (!targetLayer && !CREATE_TARGET_LAYER_IF_MISSING) {
                missingTarget.push(targetNames[i]);
                continue;
            }

            layerPairs.push({
                sourceName: sourceNames[i],
                targetName: targetNames[i],
                sourceLayer: sourceLayer,
                targetLayer: targetLayer,
            });
        }

        if (missingSource.length > 0 || missingTarget.length > 0) {
            var message = "";
            if (missingSource.length > 0) {
                message +=
                    "源文件中找不到以下图层：\n" +
                    missingSource.join("\n") +
                    "\n\n";
            }
            if (missingTarget.length > 0) {
                message +=
                    "目标文件中找不到以下图层：\n" + missingTarget.join("\n");
            }
            return {
                ok: false,
                message: message,
            };
        }

        return {
            ok: true,
            layerPairs: layerPairs,
        };
    }

    function parseLayerNames(text) {
        var rawItems = String(text).split(/[\r\n,，;；]+/);
        var names = [];

        for (var i = 0; i < rawItems.length; i++) {
            var name = trimText(rawItems[i]);
            if (name !== "") names.push(name);
        }

        return names;
    }

    function prepareLayerPairs(targetDoc, layerPairs) {
        for (var i = 0; i < layerPairs.length; i++) {
            var pair = layerPairs[i];

            if (!pair.targetLayer) {
                pair.targetLayer = targetDoc.layers.add({
                    name: pair.targetName,
                });
            }

            unlockLayer(pair.sourceLayer);
            unlockLayer(pair.targetLayer);
        }
    }

    function rememberLayerStates(layerPairs) {
        var states = [];

        for (var i = 0; i < layerPairs.length; i++) {
            addLayerState(states, layerPairs[i].sourceLayer);
            addLayerState(states, layerPairs[i].targetLayer);
        }

        return states;
    }

    function addLayerState(states, layer) {
        if (!layer || !layer.isValid) return;

        for (var i = 0; i < states.length; i++) {
            if (states[i].layer === layer) return;
        }

        states.push(rememberLayerState(layer));
    }

    function restoreLayerStates(states) {
        for (var i = states.length - 1; i >= 0; i--) {
            restoreLayerState(states[i]);
        }
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

    function trimText(value) {
        return String(value).replace(/^\s+|\s+$/g, "");
    }

    function copyByPagePlan(pagePlan, layerPairs, result) {
        for (var layerIndex = 0; layerIndex < layerPairs.length; layerIndex++) {
            result.layerStats.push({
                sourceName: layerPairs[layerIndex].sourceName,
                targetName: layerPairs[layerIndex].targetName,
                copied: 0,
                failed: 0,
            });
        }

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

            for (
                var pairIndex = 0;
                pairIndex < layerPairs.length;
                pairIndex++
            ) {
                var layerPair = layerPairs[pairIndex];
                var layerStat = result.layerStats[pairIndex];
                var itemsToCopy = getTopLevelPageItemsOnLayer(
                    sourcePage,
                    layerPair.sourceLayer,
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
                        layerPair,
                        result,
                        layerStat,
                    );
                }
            }
        }
    }

    function duplicateOneItem(
        sourceItem,
        sourcePage,
        targetPage,
        layerPair,
        result,
        layerStat,
    ) {
        try {
            var duplicatedItem = sourceItem.duplicate(targetPage);
            duplicatedItem.itemLayer = layerPair.targetLayer;
            result.copiedCount++;
            layerStat.copied++;
        } catch (dupErr) {
            layerStat.failed++;
            result.failed.push(
                "源页 " +
                    getPageName(sourcePage) +
                    " -> 目标页 " +
                    getPageName(targetPage) +
                    "，图层 " +
                    layerPair.sourceName +
                    " -> " +
                    layerPair.targetName +
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

    function buildFinalReport(
        sourceDoc,
        targetDoc,
        pagePlan,
        layerPairs,
        result,
    ) {
        var report =
            "复制完成。\n\n" +
            "源文件：" +
            sourceDoc.name +
            "\n" +
            "目标文件：" +
            targetDoc.name +
            "\n" +
            "图层对应关系：" +
            layerPairs.length +
            " 组\n" +
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
            "复制页面数量：" +
            pagePlan.pageCount +
            "\n" +
            "复制对象数量：" +
            result.copiedCount +
            "\n" +
            "跳过页面数量：" +
            result.skippedPageCount;

        if (result.layerStats.length > 0) {
            report += "\n\n逐图层统计：\n";
            for (var s = 0; s < result.layerStats.length; s++) {
                report +=
                    "- " +
                    result.layerStats[s].sourceName +
                    " -> " +
                    result.layerStats[s].targetName +
                    "：复制 " +
                    result.layerStats[s].copied +
                    " 个";

                if (result.layerStats[s].failed > 0) {
                    report += "，失败 " + result.layerStats[s].failed + " 个";
                }
                report += "\n";
            }
        }

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
