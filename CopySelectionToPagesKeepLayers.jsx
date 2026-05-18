// Copy selected page items to specified spreads, preserving spread-relative position and layers.

(function () {
    try {
        if (app.documents.length === 0) {
            alert("请先打开一个 InDesign 文档。");
            return;
        }

        var doc = app.activeDocument;
        var selection = app.selection;

        if (!selection || selection.length === 0) {
            alert("请先在一个页面或一对跨页上选中至少一个对象。");
            return;
        }

        var sourceItems = collectSourceItems(selection);
        if (sourceItems.length === 0) {
            alert("没有找到可以复制的页面对象。请选中文字框、图形框架、图片框架、路径或组。");
            return;
        }

        var sourceSpread = sourceItems[0].sourceSpread;
        for (var i = 1; i < sourceItems.length; i++) {
            if (sourceItems[i].sourceSpread !== sourceSpread) {
                alert("当前脚本要求所有选中对象都来自同一个跨页。请只选择同一跨页上的对象。");
                return;
            }
        }

        var dialogResult = askTargetSpreads(doc, sourceSpread);
        if (!dialogResult) return;

        var targetSpreads = dialogResult.targetSpreads;
        var skipSourceSpread = dialogResult.skipSourceSpread;

        if (targetSpreads.length === 0) {
            alert("没有有效的目标跨页。");
            return;
        }

        var result = {
            copied: 0,
            skippedSource: 0,
            skippedShortSpread: 0,
            failed: []
        };

        app.doScript(
            function () {
                var oldRedraw = app.scriptPreferences.enableRedraw;
                app.scriptPreferences.enableRedraw = false;

                var layerStates = rememberLayerStates(sourceItems);

                try {
                    unlockSourceLayers(sourceItems);

                    for (var p = 0; p < targetSpreads.length; p++) {
                        var targetSpread = targetSpreads[p];

                        if (skipSourceSpread && targetSpread === sourceSpread) {
                            result.skippedSource++;
                            continue;
                        }

                        if (targetSpread.pages.length < sourceSpread.pages.length) {
                            result.skippedShortSpread++;
                            continue;
                        }

                        for (var k = 0; k < sourceItems.length; k++) {
                            copyOneItem(sourceItems[k], targetSpread, result);
                        }
                    }
                } finally {
                    restoreLayerStates(layerStates);
                    app.scriptPreferences.enableRedraw = oldRedraw;
                }
            },
            ScriptLanguage.JAVASCRIPT,
            undefined,
            UndoModes.ENTIRE_SCRIPT,
            "复制选中对象到指定跨页并保持图层"
        );

        var report = "完成。\n\n";
        report += "源跨页：" + getSpreadPageNames(sourceSpread) + "\n";
        report += "复制对象数量：" + result.copied + "\n";
        if (result.skippedSource > 0) {
            report += "跳过源跨页：" + result.skippedSource + " 个\n";
        }
        if (result.skippedShortSpread > 0) {
            report += "跳过页数不足的跨页：" + result.skippedShortSpread + " 个\n";
        }
        if (result.failed.length > 0) {
            report += "\n失败/警告：" + result.failed.length + " 项\n";
            var showCount = Math.min(result.failed.length, 20);
            for (var f = 0; f < showCount; f++) {
                report += "- " + result.failed[f] + "\n";
            }
            if (result.failed.length > 20) {
                report += "... 还有 " + (result.failed.length - 20) + " 项未显示\n";
            }
        }
        report += "\n需要撤销时，按一次 Cmd+Z 即可撤销本次全部复制。";
        alert(report);
    } catch (err) {
        var lineText = err && err.line ? "\n行号：" + err.line : "";
        alert("脚本执行失败：\n\n" + err.message + lineText);
    }

    function collectSourceItems(selection) {
        var items = [];
        var seen = {};

        for (var i = 0; i < selection.length; i++) {
            var item = normalizeToPageItem(selection[i]);
            if (!item) continue;

            var key = getItemKey(item);
            if (seen[key]) continue;
            seen[key] = true;

            var sourcePage = safeRead(item, "parentPage");
            if (!sourcePage || !sourcePage.isValid) {
                alert("有选中对象不在普通页面上，可能在粘贴板、主页或嵌入对象中。请只选择页面上的对象。");
                return [];
            }

            var layer = safeRead(item, "itemLayer");
            if (!layer || !layer.isValid) {
                alert("有选中对象无法读取图层信息。");
                return [];
            }

            var topLeft = getSpreadTopLeft(item);
            if (!topLeft) continue;

            items.push({
                item: item,
                sourceSpread: sourcePage.parent,
                sourceLayer: layer,
                spreadX: topLeft[0],
                spreadY: topLeft[1],
                name: getItemName(item)
            });
        }

        return items;
    }

    function normalizeToPageItem(item) {
        if (!item || !safeIsValid(item)) return null;

        if (canDuplicatePageItem(item) && safeRead(item, "parentPage")) {
            return item;
        }

        var parent = safeRead(item, "parent");
        while (parent && safeIsValid(parent)) {
            if (canDuplicatePageItem(parent) && safeRead(parent, "parentPage")) {
                return parent;
            }
            parent = safeRead(parent, "parent");
        }

        return null;
    }

    function canDuplicatePageItem(item) {
        if (!item) return false;
        if (typeof item.duplicate !== "function") return false;
        try {
            var gb = item.geometricBounds;
            return gb && gb.length === 4;
        } catch (e) {
            return false;
        }
    }

    function askTargetSpreads(doc, sourceSpread) {
        var defaultRange = buildDefaultRangeFromActualPageNames(doc, sourceSpread);

        var dialog = new Window("dialog", "复制选中对象到指定跨页");
        dialog.orientation = "column";
        dialog.alignChildren = "fill";
        dialog.margins = 16;
        dialog.spacing = 12;

        var info = dialog.add(
            "statictext",
            undefined,
            "源跨页：" + getSpreadPageNames(sourceSpread)
        );
        info.graphics.foregroundColor = info.graphics.newPen(
            info.graphics.PenType.SOLID_COLOR,
            [0.35, 0.35, 0.35],
            1
        );

        var rangeGroup = dialog.add("group");
        rangeGroup.orientation = "row";
        rangeGroup.spacing = 8;
        rangeGroup.add("statictext", undefined, "目标页面范围：");
        var rangeInput = rangeGroup.add("edittext", undefined, defaultRange);
        rangeInput.characters = 26;

        var hint = dialog.add(
            "statictext",
            undefined,
            "输入 InDesign 中显示的实际页码，示例：24-40, 48；会复制到这些页面所在的跨页"
        );
        hint.graphics.foregroundColor = hint.graphics.newPen(
            hint.graphics.PenType.SOLID_COLOR,
            [0.5, 0.5, 0.5],
            1
        );

        var skipCheckbox = dialog.add("checkbox", undefined, "如果范围包含源跨页，则跳过源跨页");
        skipCheckbox.value = true;

        var btnGroup = dialog.add("group");
        btnGroup.alignment = "right";
        btnGroup.add("button", undefined, "取消", { name: "cancel" });
        btnGroup.add("button", undefined, "确定", { name: "ok" });

        if (dialog.show() !== 1) return null;

        var targetSpreads = parsePageRangeToSpreads(doc, rangeInput.text);
        if (!targetSpreads) return null;

        return {
            targetSpreads: targetSpreads,
            skipSourceSpread: skipCheckbox.value
        };
    }

    function parsePageRangeToSpreads(doc, text) {
        var clean = String(text).replace(/\s/g, "");
        if (clean === "") {
            alert("请输入目标页面范围。");
            return null;
        }

        var parts = clean.split(",");
        var spreads = [];
        var seen = {};
        var missingParts = [];

        for (var i = 0; i < parts.length; i++) {
            var part = parts[i];
            if (part === "") continue;

            var rangeMatch = part.match(/^(\d+)-(\d+)$/);
            if (rangeMatch) {
                var start = parseInt(rangeMatch[1], 10);
                var end = parseInt(rangeMatch[2], 10);

                if (start > end) {
                    var temp = start;
                    start = end;
                    end = temp;
                }

                if (addSpreadsByActualPageNumberRange(doc, spreads, seen, start, end) === 0) {
                    missingParts.push(part);
                }
            } else {
                if (addSpreadsByActualPageName(doc, spreads, seen, part) === 0) {
                    missingParts.push(part);
                }
            }
        }

        if (missingParts.length > 0) {
            alert(
                "以下实际页码在当前文档中没有找到：\n\n" +
                    missingParts.join(", ") +
                    "\n\n请注意：这里使用的是 InDesign 中显示的页码，不是页面在文档中的顺序。"
            );
            return null;
        }

        if (spreads.length === 0) {
            alert("没有找到有效目标跨页。");
            return null;
        }

        return spreads;
    }

    function addSpreadsByActualPageNumberRange(doc, spreads, seen, start, end) {
        var matched = 0;
        for (var i = 0; i < doc.pages.length; i++) {
            var pageNumber = getActualPageNumber(doc.pages[i]);
            if (pageNumber === null) continue;
            if (pageNumber < start || pageNumber > end) continue;
            addSpread(spreads, seen, doc.pages[i].parent);
            matched++;
        }
        return matched;
    }

    function addSpreadsByActualPageName(doc, spreads, seen, pageNameText) {
        var wantedNumber = parseUnsignedInteger(pageNameText);
        var matched = 0;

        for (var i = 0; i < doc.pages.length; i++) {
            var page = doc.pages[i];
            var pageName = String(page.name);
            var pageNumber = getActualPageNumber(page);

            if (
                pageName === pageNameText ||
                (wantedNumber !== null && pageNumber === wantedNumber)
            ) {
                addSpread(spreads, seen, page.parent);
                matched++;
            }
        }

        return matched;
    }

    function addSpread(spreads, seen, spread) {
        var key = getItemKey(spread);
        if (seen[key]) return;
        spreads.push(spread);
        seen[key] = true;
    }

    function buildDefaultRangeFromActualPageNames(doc, sourceSpread) {
        var sourceLastNumber = null;
        var maxNumber = null;

        for (var s = 0; s < sourceSpread.pages.length; s++) {
            var sourcePageNumber = getActualPageNumber(sourceSpread.pages[s]);
            if (sourcePageNumber === null) continue;
            if (sourceLastNumber === null || sourcePageNumber > sourceLastNumber) {
                sourceLastNumber = sourcePageNumber;
            }
        }

        for (var i = 0; i < doc.pages.length; i++) {
            var pageNumber = getActualPageNumber(doc.pages[i]);
            if (pageNumber === null) continue;
            if (maxNumber === null || pageNumber > maxNumber) {
                maxNumber = pageNumber;
            }
        }

        if (sourceLastNumber !== null && maxNumber !== null) {
            if (sourceLastNumber < maxNumber) {
                return String(sourceLastNumber + 1) + "-" + String(maxNumber);
            }
            return String(sourceLastNumber);
        }

        return String(sourceSpread.pages[0].name);
    }

    function getActualPageNumber(page) {
        return parseUnsignedInteger(String(page.name));
    }

    function parseUnsignedInteger(text) {
        if (!/^\d+$/.test(String(text))) return null;
        return parseInt(text, 10);
    }

    function copyOneItem(sourceInfo, targetSpread, result) {
        try {
            var duplicatedItem = sourceInfo.item.duplicate(targetSpread);

            try {
                duplicatedItem.itemLayer = sourceInfo.sourceLayer;
            } catch (layerErr) {
                result.failed.push(sourceInfo.name + " 设置图层失败：" + layerErr.message);
            }

            var targetTopLeft = getSpreadTopLeft(duplicatedItem);
            if (targetTopLeft) {
                duplicatedItem.move(undefined, [
                    sourceInfo.spreadX - targetTopLeft[0],
                    sourceInfo.spreadY - targetTopLeft[1]
                ]);
            }

            result.copied++;
        } catch (err) {
            result.failed.push(sourceInfo.name + " 复制到目标跨页 " + getSpreadPageNames(targetSpread) + " 失败：" + err.message);
        }
    }

    function getSpreadTopLeft(item) {
        try {
            var point = item.resolve(
                AnchorPoint.TOP_LEFT_ANCHOR,
                CoordinateSpaces.SPREAD_COORDINATES
            )[0];
            return [point[0], point[1]];
        } catch (e1) {
            try {
                var gb = item.geometricBounds;
                return [gb[1], gb[0]];
            } catch (e2) {
                return null;
            }
        }
    }

    function getSpreadPageNames(spread) {
        var names = [];
        try {
            for (var i = 0; i < spread.pages.length; i++) {
                names.push("第 " + (spread.pages[i].documentOffset + 1) + " 页/" + spread.pages[i].name);
            }
        } catch (e) {}

        if (names.length === 0) return "未知跨页";
        return names.join("，");
    }

    function rememberLayerStates(sourceItems) {
        var states = [];
        var seen = {};

        for (var i = 0; i < sourceItems.length; i++) {
            var layer = sourceItems[i].sourceLayer;
            var key = getItemKey(layer);
            if (seen[key]) continue;
            seen[key] = true;

            states.push({
                layer: layer,
                locked: safeRead(layer, "locked"),
                visible: safeRead(layer, "visible")
            });
        }

        return states;
    }

    function unlockSourceLayers(sourceItems) {
        for (var i = 0; i < sourceItems.length; i++) {
            var layer = sourceItems[i].sourceLayer;
            try {
                layer.locked = false;
            } catch (e1) {}
            try {
                layer.visible = true;
            } catch (e2) {}
        }
    }

    function restoreLayerStates(states) {
        for (var i = 0; i < states.length; i++) {
            try {
                states[i].layer.locked = states[i].locked;
            } catch (e1) {}
            try {
                states[i].layer.visible = states[i].visible;
            } catch (e2) {}
        }
    }

    function getItemName(item) {
        var name = safeRead(item, "name");
        if (name && String(name) !== "") return String(name);
        var ctor = safeRead(item, "constructor");
        if (ctor && ctor.name) return ctor.name;
        return "对象";
    }

    function getItemKey(item) {
        var id = safeRead(item, "id");
        if (id !== null && id !== undefined) return String(id);

        try {
            return item.toSpecifier();
        } catch (e) {
            return String(Math.random());
        }
    }

    function safeRead(obj, prop) {
        try {
            return obj[prop];
        } catch (e) {
            return null;
        }
    }

    function safeIsValid(obj) {
        try {
            return obj && obj.isValid;
        } catch (e) {
            return false;
        }
    }
})();
