/*
  文件: SortSelectedItemsByReadingOrder.jsx

  用途:
  - 将当前选中的页面对象按阅读顺序排序，并依次重命名、写入脚本标签。

  使用前:
  - 打开要处理的 InDesign 文档。
  - 在同一跨页、同一图层内选中若干对象。

  运行流程:
  1. 运行脚本。
  2. 输入基础文字。
  3. 脚本按阅读顺序生成 基础文字_1、基础文字_2 等名称和标签。
  4. 确认后重新排列堆叠顺序并写入名称/标签。

  注意:
  - 支持文本框、图片框、空框架、线条和 Group 等常见 PageItem。
  - 阅读顺序第 1 个会放到当前图层最前。
  - 排序和写入包装为一次撤销操作。
*/
(function () {
    var ROW_TOLERANCE = 5;
    var NUMBER_SEPARATOR = "_";
    var SCRIPT_LABEL_KEY = "reading_order_label";
    var SCRIPT_NAME_KEY = "reading_order_name";

    try {
        main();
    } catch (err) {
        alert("脚本执行失败：\n" + errorText(err));
    }

    function main() {
        if (app.documents.length === 0) {
            alert("请先打开一个 InDesign 文档。");
            return;
        }

        var doc = app.activeDocument;

        if (app.selection.length === 0) {
            alert("请先在同一跨页上选中要排序、命名和打标签的对象。");
            return;
        }

        var selectedItems = collectSelectedPageItems(app.selection);
        if (selectedItems.length === 0) {
            alert(
                "当前选区里没有找到可处理的页面对象。\n\n" +
                    "请直接选中文本框、图片框、空框架、线条或组合对象。"
            );
            return;
        }

        var validation = validateSameSpreadAndLayer(selectedItems);
        if (!validation.ok) {
            alert(validation.message);
            return;
        }

        var sortedItems = sortItemsByReadingOrder(selectedItems, doc, ROW_TOLERANCE);

        var baseText = prompt(
            "请输入基础文字：\n\n" +
                "脚本会把这段文字同时作为对象名称和标签，并在后面追加序号。\n" +
                "例如输入 item，会生成 item_1、item_2、item_3 ...",
            "item"
        );
        if (baseText === null) return;
        baseText = trim(baseText);
        if (baseText === "") {
            alert("基础文字不能为空。");
            return;
        }

        var confirmMessage =
            "将处理对象：" +
            sortedItems.length +
            " 个\n" +
            "跨页：" +
            validation.spreadName +
            "\n" +
            "图层：" +
            validation.layerName +
            "\n\n" +
            "名称将写为：" +
            baseText +
            NUMBER_SEPARATOR +
            "1 ... " +
            baseText +
            NUMBER_SEPARATOR +
            sortedItems.length +
            "\n" +
            "标签将写为：" +
            baseText +
            NUMBER_SEPARATOR +
            "1 ... " +
            baseText +
            NUMBER_SEPARATOR +
            sortedItems.length +
            "\n\n" +
            "阅读顺序第 1 个会排到该图层最前面。\n\n是否继续？";

        if (!confirm(confirmMessage)) return;

        var failedList = [];

        app.doScript(
            function () {
                var oldRedraw = app.scriptPreferences.enableRedraw;
                app.scriptPreferences.enableRedraw = false;

                try {
                    reorderStackByReadingOrder(sortedItems, failedList);
                    renameAndLabelItems(sortedItems, baseText, baseText, failedList);
                } finally {
                    app.scriptPreferences.enableRedraw = oldRedraw;
                }
            },
            ScriptLanguage.JAVASCRIPT,
            undefined,
            UndoModes.ENTIRE_SCRIPT,
            "按阅读顺序排序并命名标签"
        );

        var report =
            "完成。\n\n" +
            "已处理对象：" +
            sortedItems.length +
            " 个\n" +
            "名称：" +
            baseText +
            NUMBER_SEPARATOR +
            "1 ... " +
            baseText +
            NUMBER_SEPARATOR +
            sortedItems.length +
            "\n" +
            "标签：" +
            baseText +
            NUMBER_SEPARATOR +
            "1 ... " +
            baseText +
            NUMBER_SEPARATOR +
            sortedItems.length;

        if (failedList.length > 0) {
            report += "\n\n以下操作失败：\n" + failedList.join("\n");
        }

        alert(report);
    }

    function collectSelectedPageItems(selection) {
        var items = [];
        var seen = {};

        for (var i = 0; i < selection.length; i++) {
            addPageItemFromSelection(selection[i], items, seen);
        }

        return items;
    }

    function addPageItemFromSelection(selectionItem, items, seen) {
        var item = normalizeToPageItem(selectionItem);
        if (!isUsablePageItem(item)) return;

        var key = getItemKey(item);
        if (key !== null) {
            if (seen[key]) return;
            seen[key] = true;
        }

        items.push(item);
    }

    function normalizeToPageItem(item) {
        if (isPageItemLike(item)) return item;

        try {
            if (item.parent && isPageItemLike(item.parent)) return item.parent;
        } catch (e1) {}

        try {
            if (
                item.parentTextFrames &&
                item.parentTextFrames.length > 0 &&
                isPageItemLike(item.parentTextFrames[0])
            ) {
                return item.parentTextFrames[0];
            }
        } catch (e2) {}

        return null;
    }

    function isPageItemLike(item) {
        if (!item) return false;

        try {
            if (!item.geometricBounds || item.geometricBounds.length !== 4) return false;
        } catch (e1) {
            return false;
        }

        try {
            if (item.itemLayer === undefined || item.itemLayer === null) return false;
        } catch (e2) {
            return false;
        }

        return true;
    }

    function isUsablePageItem(item) {
        if (!isPageItemLike(item)) return false;

        try {
            if (!item.parentPage) return false;
        } catch (e1) {
            return false;
        }

        try {
            if (item.locked) return false;
            if (item.itemLayer.locked || !item.itemLayer.visible) return false;
        } catch (e2) {
            return false;
        }

        return true;
    }

    function validateSameSpreadAndLayer(items) {
        var firstSpread = null;
        var firstLayer = null;
        var spreadName = "";
        var layerName = "";

        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var page = null;
            var spread = null;
            var layer = null;

            try {
                page = item.parentPage;
                spread = getSpreadFromPage(page);
                layer = item.itemLayer;
            } catch (e) {
                return {
                    ok: false,
                    message: "有对象无法读取所在跨页或图层，请检查是否选中了异常对象。"
                };
            }

            if (!spread) {
                return {
                    ok: false,
                    message: "有对象无法读取所在跨页，请确认对象位于正常文档页面上。"
                };
            }

            if (!firstSpread) {
                firstSpread = spread;
                firstLayer = layer;
                spreadName = spreadDisplayName(spread, page);
                layerName = safeName(layer);
                continue;
            }

            if (spread !== firstSpread) {
                return {
                    ok: false,
                    message:
                        "选中的对象不在同一跨页。\n\n请只选中同一跨页上的对象后再运行脚本。"
                };
            }

            if (layer !== firstLayer) {
                return {
                    ok: false,
                    message:
                        "选中的对象不在同一图层。\n\n" +
                        "InDesign 的对象前后叠放受图层限制；请先把这些对象放到同一图层，再运行脚本。"
                };
            }
        }

        return {
            ok: true,
            spreadName: spreadName,
            layerName: layerName
        };
    }

    function getSpreadFromPage(page) {
        if (!page) return null;
        try {
            if (page.parent) return page.parent;
        } catch (e1) {}
        return null;
    }

    function spreadDisplayName(spread, samplePage) {
        var pageNames = [];

        try {
            for (var i = 0; i < spread.pages.length; i++) {
                pageNames.push(safeName(spread.pages[i]));
            }
        } catch (e1) {}

        if (pageNames.length > 0) return pageNames.join("-");

        try {
            if (spread.index !== undefined) return "第 " + (spread.index + 1) + " 个跨页";
        } catch (e2) {}

        return safeName(samplePage);
    }

    function sortItemsByReadingOrder(items, doc, rowTolerance) {
        var records = [];

        for (var i = 0; i < items.length; i++) {
            var b = items[i].geometricBounds;
            records.push({
                item: items[i],
                pageIndex: getPageIndex(items[i], doc),
                cy: (Number(b[0]) + Number(b[2])) / 2,
                cx: (Number(b[1]) + Number(b[3])) / 2
            });
        }

        records.sort(function (a, b) {
            if (a.pageIndex !== b.pageIndex) return a.pageIndex - b.pageIndex;
            if (a.cy !== b.cy) return a.cy - b.cy;
            return a.cx - b.cx;
        });

        var sorted = [];
        var pageRows = [];
        var currentPage = null;
        var currentRow = [];
        var currentRowY = 0;

        function flushRow() {
            if (currentRow.length === 0) return;
            currentRow.sort(function (a, b) {
                return a.cx - b.cx;
            });
            pageRows.push(currentRow);
            currentRow = [];
        }

        function flushPage() {
            flushRow();
            for (var r = 0; r < pageRows.length; r++) {
                for (var c = 0; c < pageRows[r].length; c++) {
                    sorted.push(pageRows[r][c].item);
                }
            }
            pageRows = [];
        }

        for (var n = 0; n < records.length; n++) {
            var rec = records[n];

            if (currentPage === null || rec.pageIndex !== currentPage) {
                if (currentPage !== null) flushPage();
                currentPage = rec.pageIndex;
                currentRow = [rec];
                currentRowY = rec.cy;
                continue;
            }

            if (Math.abs(rec.cy - currentRowY) <= rowTolerance) {
                currentRow.push(rec);
                currentRowY =
                    (currentRowY * (currentRow.length - 1) + rec.cy) /
                    currentRow.length;
            } else {
                flushRow();
                currentRow = [rec];
                currentRowY = rec.cy;
            }
        }

        flushPage();
        return sorted;
    }

    function reorderStackByReadingOrder(sortedItems, failedList) {
        for (var i = sortedItems.length - 1; i >= 0; i--) {
            try {
                sortedItems[i].bringToFront();
            } catch (err) {
                failedList.push(
                    "第 " +
                        (i + 1) +
                        " 个对象排序失败: " +
                        errorText(err)
                );
            }
        }
    }

    function renameAndLabelItems(sortedItems, baseName, baseLabel, failedList) {
        for (var i = 0; i < sortedItems.length; i++) {
            var item = sortedItems[i];
            var nameValue = baseName + NUMBER_SEPARATOR + (i + 1);
            var labelValue = baseLabel + NUMBER_SEPARATOR + (i + 1);

            try {
                item.name = nameValue;
            } catch (nameErr) {
                failedList.push(nameValue + " 设置名称失败: " + errorText(nameErr));
            }

            try {
                item.label = labelValue;
            } catch (labelErr) {
                failedList.push(labelValue + " 设置标签失败: " + errorText(labelErr));
            }

            try {
                item.insertLabel(SCRIPT_NAME_KEY, nameValue);
                item.insertLabel(SCRIPT_LABEL_KEY, labelValue);
            } catch (insertErr) {
                failedList.push(labelValue + " 写入隐藏标签失败: " + errorText(insertErr));
            }
        }
    }

    function getPageIndex(item, doc) {
        try {
            if (item.parentPage && item.parentPage.documentOffset !== undefined) {
                return item.parentPage.documentOffset;
            }
        } catch (e1) {}

        try {
            for (var i = 0; i < doc.pages.length; i++) {
                if (item.parentPage === doc.pages[i]) return i;
            }
        } catch (e2) {}

        return 999999;
    }

    function getItemKey(item) {
        try {
            if (item.id !== undefined && item.id !== null) {
                return "id:" + item.id;
            }
        } catch (e1) {}

        try {
            return "spec:" + item.toSpecifier();
        } catch (e2) {}

        return null;
    }

    function safeName(item) {
        try {
            if (item && item.name !== undefined && item.name !== null) {
                return String(item.name);
            }
        } catch (e) {}
        return "(无法读取名称)";
    }

    function trim(value) {
        return String(value).replace(/^\s+|\s+$/g, "");
    }

    function errorText(err) {
        if (!err) return "未知错误";
        var text = "";
        try {
            if (err.message) text += err.message;
        } catch (e1) {}
        try {
            if (err.line) text += "\n行号: " + err.line;
        } catch (e2) {}
        return text || String(err);
    }
})();
