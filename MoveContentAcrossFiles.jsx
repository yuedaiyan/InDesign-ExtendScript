// Copy Specific Layer Items From One InDesign Document To Another
// 从一个 InDesign 文件的指定图层，复制指定页码范围的内容到另一个文件的指定图层
// 适合：源文件和目标文件页面尺寸、页面结构基本一致的情况

(function () {
    if (app.documents.length < 2) {
        alert("请至少打开两个 InDesign 文件：源文件和目标文件。");
        return;
    }

    // =========================
    // 你需要修改的配置
    // =========================

    // 源文件名称。留空 "" 表示使用当前激活的文件作为源文件
    var SOURCE_DOC_NAME = "";

    // 目标文件名称。必须写目标文件的完整文档名，例如 "target.indd"
    var TARGET_DOC_NAME = "diary_Ring.indd";

    // 源文件中要复制的图层名称
    var SOURCE_LAYER_NAME = "text";

    // 目标文件中要粘贴到的图层名称
    var TARGET_LAYER_NAME = "body_text_new";

    // 源文件从第几页开始复制
    var SOURCE_START_PAGE = 2;

    // 目标文件从第几页开始粘贴
    var TARGET_START_PAGE = 24;

    // 一共复制多少页
    var PAGE_COUNT = 58;

    // 是否自动创建目标图层
    var CREATE_TARGET_LAYER_IF_MISSING = false;

    // 是否跳过单页跨页，通常首页、末页可能是单页
    // 如果你不想跳过，改成 false
    var SKIP_SINGLE_PAGE_SPREADS = false;

    // =========================
    // 主逻辑
    // =========================

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

    var sourceLayer = getLayerByName(sourceDoc, SOURCE_LAYER_NAME);
    if (!sourceLayer) {
        alert("源文件中找不到图层：" + SOURCE_LAYER_NAME);
        return;
    }

    var targetLayer = getLayerByName(targetDoc, TARGET_LAYER_NAME);
    if (!targetLayer) {
        if (CREATE_TARGET_LAYER_IF_MISSING) {
            targetLayer = targetDoc.layers.add({ name: TARGET_LAYER_NAME });
        } else {
            alert("目标文件中找不到图层：" + TARGET_LAYER_NAME);
            return;
        }
    }

    if (SOURCE_START_PAGE < 1 || TARGET_START_PAGE < 1 || PAGE_COUNT < 1) {
        alert(
            "页码参数错误：SOURCE_START_PAGE、TARGET_START_PAGE、PAGE_COUNT 都必须大于等于 1。",
        );
        return;
    }

    var sourceEndPage = SOURCE_START_PAGE + PAGE_COUNT - 1;
    var targetEndPage = TARGET_START_PAGE + PAGE_COUNT - 1;

    if (sourceEndPage > sourceDoc.pages.length) {
        alert(
            "源文件页码范围超出。\n\n" +
                "源文件总页数：" +
                sourceDoc.pages.length +
                "\n" +
                "请求复制到源文件第：" +
                sourceEndPage +
                " 页",
        );
        return;
    }

    if (targetEndPage > targetDoc.pages.length) {
        alert(
            "目标文件页码范围超出。\n\n" +
                "目标文件总页数：" +
                targetDoc.pages.length +
                "\n" +
                "请求粘贴到目标文件第：" +
                targetEndPage +
                " 页",
        );
        return;
    }

    var copiedCount = 0;
    var skippedPageCount = 0;

    try {
        unlockLayer(sourceLayer);
        unlockLayer(targetLayer);

        for (var offset = 0; offset < PAGE_COUNT; offset++) {
            var sourcePageIndex = SOURCE_START_PAGE - 1 + offset;
            var targetPageIndex = TARGET_START_PAGE - 1 + offset;

            var sourcePage = sourceDoc.pages[sourcePageIndex];
            var targetPage = targetDoc.pages[targetPageIndex];

            if (
                SKIP_SINGLE_PAGE_SPREADS &&
                sourcePage.parent.pages.length === 1
            ) {
                skippedPageCount++;
                continue;
            }

            var itemsToCopy = getTopLevelPageItemsOnLayer(
                sourcePage,
                sourceLayer,
            );

            if (itemsToCopy.length === 0) {
                continue;
            }

            // 不再使用 copy / pasteInPlace。
            // pasteInPlace 很依赖当前窗口焦点，在某些 InDesign 环境里会一直粘到同一页。
            // 这里直接把对象 duplicate 到指定 targetPage，更稳定。
            for (
                var itemIndex = 0;
                itemIndex < itemsToCopy.length;
                itemIndex++
            ) {
                var sourceItem = itemsToCopy[itemIndex];

                try {
                    var duplicatedItem = sourceItem.duplicate(targetPage);
                    duplicatedItem.itemLayer = targetLayer;
                    copiedCount++;
                } catch (dupErr) {
                    // 某些特殊对象可能不能直接 duplicate 到页面，跳过它
                }
            }
        }

        alert(
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
                SOURCE_START_PAGE +
                " - " +
                sourceEndPage +
                "\n" +
                "目标文件页码范围：" +
                TARGET_START_PAGE +
                " - " +
                targetEndPage +
                "\n\n" +
                "复制对象数量：" +
                copiedCount +
                "\n" +
                "跳过页面数量：" +
                skippedPageCount,
        );
    } catch (err) {
        alert("脚本出错：\n\n" + err.message);
    } finally {
        try {
            app.select(null);
        } catch (e3) {}
    }

    // =========================
    // 工具函数
    // =========================

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

    function unlockLayer(layer) {
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
})();
