/*
  文件: FillTextFromImageNames.jsx

  用途:
  - 把右侧图片组中各图片框的链接文件名去扩展名后，写入左侧文本组中位置对应的文本框。

  使用前:
  - 打开毕业设计 InDesign 文档。
  - 在跨页上同时选中两个 Group：一个文本框组和一个图片框组。
  - 确认要处理的页码范围中保持偶数页文本组、奇数页图片组的对应结构。

  运行流程:
  1. 运行脚本。
  2. 输入页码范围。
  3. 脚本逐对处理文本组和图片组，并按组内位置写入文件名。

  注意:
  - 组内按从左到右、从上到下排序，行容差为 3 mm。
  - 空图片框对应的文本框保持不变；非空图片框会覆盖对应文本框已有内容。
*/
(function () {
    // ---------- 配置 ----------
    var ROW_TOLERANCE_MM = 3; // 行容差,毫米

    // ---------- 入口检查 ----------
    if (app.documents.length === 0) {
        alert("请先打开一个文档。");
        return;
    }
    var doc = app.activeDocument;

    // 备份并切换度量单位为 mm,结束时恢复
    var oldHUnits = doc.viewPreferences.horizontalMeasurementUnits;
    var oldVUnits = doc.viewPreferences.verticalMeasurementUnits;
    doc.viewPreferences.horizontalMeasurementUnits =
        MeasurementUnits.MILLIMETERS;
    doc.viewPreferences.verticalMeasurementUnits = MeasurementUnits.MILLIMETERS;

    try {
        run(doc);
    } catch (e) {
        alert("脚本错误:\n" + e.message + "\n\n位置: line " + e.line);
    } finally {
        doc.viewPreferences.horizontalMeasurementUnits = oldHUnits;
        doc.viewPreferences.verticalMeasurementUnits = oldVUnits;
    }

    // ---------- 主流程 ----------
    function run(doc) {
        // 1. 校验初始选择
        var sel = app.selection;
        if (sel.length !== 2) {
            alert(
                "请先跨页同时选中两个 Group:\n左侧文本框组 + 右侧图片框组。\n\n当前选中的对象数量: " +
                    sel.length,
            );
            return;
        }
        if (!(sel[0] instanceof Group) || !(sel[1] instanceof Group)) {
            alert("当前选中的对象必须都是 Group。");
            return;
        }

        // 2. 自动识别哪个是文本组、哪个是图片组
        var classified = classifyGroups(sel[0], sel[1]);
        if (!classified) {
            alert(
                "无法识别选中的两个组:\n一个组应当只包含文本框 (TextFrame),\n另一个组应当只包含图片框 (Rectangle/Oval/Polygon)。",
            );
            return;
        }
        var sampleTextGroup = classified.textGroup;
        var sampleImageGroup = classified.imageGroup;
        var samplePageText = sampleTextGroup.parentPage;
        var samplePageImage = sampleImageGroup.parentPage;

        if (samplePageText === null || samplePageImage === null) {
            alert("选中的组必须位于页面上(不能在粘贴板上)。");
            return;
        }

        // 3. 询问页码范围
        var defaultStart = Math.min(
            parseInt(samplePageText.name, 10),
            parseInt(samplePageImage.name, 10),
        );
        var defaultEnd = Math.max(
            parseInt(samplePageText.name, 10),
            parseInt(samplePageImage.name, 10),
        );
        var defaultRange = defaultStart + "-" + defaultEnd;

        var rangeInput = Window.prompt(
            "请输入要处理的页码范围\n" +
                "格式: 起始页-结束页 (例如 2-20)\n\n" +
                "范围内每一对 偶数页文字组 + 奇数页图片组 都会被处理。",
            defaultRange,
            "页码范围",
        );
        if (rangeInput === null) return;

        var range = parseRange(rangeInput);
        if (!range) {
            alert("页码格式不正确。请使用类似 2-20 的格式。");
            return;
        }

        // 4. 收集所有页对
        var pagePairs = collectPagePairs(doc, range.start, range.end);
        if (pagePairs.length === 0) {
            alert(
                "在范围 " +
                    range.start +
                    "-" +
                    range.end +
                    " 内未找到任何 偶数页+奇数页 的页对。",
            );
            return;
        }

        // 5. 结构校验
        var validation = validatePairs(pagePairs);
        if (validation.errors.length > 0) {
            var msg = "发现 " + validation.errors.length + " 个问题:\n\n";
            for (var i = 0; i < validation.errors.length && i < 20; i++) {
                msg += "\u2022 " + validation.errors[i] + "\n";
            }
            if (validation.errors.length > 20) {
                msg +=
                    "... \u8FD8\u6709 " +
                    (validation.errors.length - 20) +
                    " 个问题未显示\n";
            }
            msg +=
                "\n" +
                validation.validPairs.length +
                " 个页对没有问题。\n\n是否继续处理无错误的页对?";
            if (!Window.confirm(msg)) return;
        }

        // 6. 执行写入
        var stats = { pairs: 0, written: 0, skipped: 0 };
        for (var p = 0; p < validation.validPairs.length; p++) {
            processPair(validation.validPairs[p], stats);
        }

        // 7. 汇报
        alert(
            "完成。\n\n" +
                "处理页对: " +
                stats.pairs +
                "\n" +
                "写入文件名: " +
                stats.written +
                "\n" +
                "跳过空框: " +
                stats.skipped,
        );
    }

    // ---------- 把 group.pageItems 里的泛化 PageItem 转成具体子类 ----------
    // group.pageItems 在迭代时常返回泛化 PageItem,需要 getElements()[0] 解包
    function resolveItem(item) {
        if (item && typeof item.getElements === "function") {
            try {
                var els = item.getElements();
                if (els && els.length > 0) return els[0];
            } catch (e) {}
        }
        return item;
    }

    function getResolvedChildren(group) {
        var raw = group.pageItems;
        var out = [];
        for (var i = 0; i < raw.length; i++) {
            out.push(resolveItem(raw[i]));
        }
        return out;
    }

    // ---------- 分类两个组:文本组 / 图片组 ----------
    function classifyGroups(g1, g2) {
        var t1 = isPureTextGroup(g1),
            i1 = isPureImageGroup(g1);
        var t2 = isPureTextGroup(g2),
            i2 = isPureImageGroup(g2);
        if (t1 && i2) return { textGroup: g1, imageGroup: g2 };
        if (t2 && i1) return { textGroup: g2, imageGroup: g1 };
        return null;
    }

    function isPureTextGroup(g) {
        var items = getResolvedChildren(g);
        if (items.length === 0) return false;
        for (var i = 0; i < items.length; i++) {
            if (!(items[i] instanceof TextFrame)) return false;
        }
        return true;
    }

    function isPureImageGroup(g) {
        var items = getResolvedChildren(g);
        if (items.length === 0) return false;
        for (var i = 0; i < items.length; i++) {
            // 图片框通常是 Rectangle / Oval / Polygon,不是 TextFrame 即可
            if (items[i] instanceof TextFrame) return false;
        }
        return true;
    }

    // ---------- 解析页码范围 ----------
    function parseRange(s) {
        s = s.replace(/\s/g, "");
        var m = s.match(/^(\d+)-(\d+)$/);
        if (!m) return null;
        var a = parseInt(m[1], 10),
            b = parseInt(m[2], 10);
        if (isNaN(a) || isNaN(b)) return null;
        return { start: Math.min(a, b), end: Math.max(a, b) };
    }

    // ---------- 收集页对(偶数页+奇数页) ----------
    function collectPagePairs(doc, startNum, endNum) {
        var pairs = [];
        var pages = doc.pages;
        var byName = {};
        for (var i = 0; i < pages.length; i++) {
            byName[pages[i].name] = pages[i];
        }
        for (var n = startNum; n <= endNum; n++) {
            if (n % 2 !== 0) continue;
            var even = byName[String(n)];
            var odd = byName[String(n + 1)];
            if (even && odd && n + 1 <= endNum) {
                pairs.push({ textPage: even, imagePage: odd });
            }
        }
        return pairs;
    }

    // ---------- 结构校验 ----------
    function validatePairs(pairs) {
        var errors = [];
        var validPairs = [];

        for (var i = 0; i < pairs.length; i++) {
            var pair = pairs[i];
            var textGroups = findGroupsOnPage(pair.textPage);
            var imageGroups = findGroupsOnPage(pair.imagePage);

            if (textGroups.length === 0) {
                errors.push("页 " + pair.textPage.name + ": 找不到可见的组");
                continue;
            }
            if (textGroups.length > 1) {
                errors.push(
                    "页 " +
                        pair.textPage.name +
                        ": 发现 " +
                        textGroups.length +
                        " 个可见组,期待 1 个",
                );
                continue;
            }
            if (imageGroups.length === 0) {
                errors.push("页 " + pair.imagePage.name + ": 找不到可见的组");
                continue;
            }
            if (imageGroups.length > 1) {
                errors.push(
                    "页 " +
                        pair.imagePage.name +
                        ": 发现 " +
                        imageGroups.length +
                        " 个可见组,期待 1 个",
                );
                continue;
            }

            var tg = textGroups[0];
            var ig = imageGroups[0];

            if (!isPureTextGroup(tg)) {
                errors.push(
                    "页 " + pair.textPage.name + ": 组内含有非文本框元素",
                );
                continue;
            }
            if (!isPureImageGroup(ig)) {
                errors.push(
                    "页 " +
                        pair.imagePage.name +
                        ": 组内含有文本框(应为图片组)",
                );
                continue;
            }

            var textItems = visibleUnlockedItems(tg);
            var imageItems = visibleUnlockedItems(ig);

            if (textItems.length !== imageItems.length) {
                errors.push(
                    "页对 " +
                        pair.textPage.name +
                        "/" +
                        pair.imagePage.name +
                        ": 文本框数 " +
                        textItems.length +
                        " 与图片框数 " +
                        imageItems.length +
                        " 不一致",
                );
                continue;
            }

            validPairs.push({
                textPage: pair.textPage,
                imagePage: pair.imagePage,
                textGroup: tg,
                imageGroup: ig,
                textItems: textItems,
                imageItems: imageItems,
            });
        }

        return { errors: errors, validPairs: validPairs };
    }

    function findGroupsOnPage(page) {
        var result = [];
        var items = page.pageItems;
        for (var i = 0; i < items.length; i++) {
            var it = resolveItem(items[i]);
            if (!(it instanceof Group)) continue;
            if (!isItemVisibleAndUnlocked(it)) continue;
            result.push(it);
        }
        return result;
    }

    function isItemVisibleAndUnlocked(item) {
        try {
            if (item.locked) return false;
        } catch (e) {}
        try {
            if (
                item.itemLayer &&
                (item.itemLayer.locked || !item.itemLayer.visible)
            )
                return false;
        } catch (e) {}
        return true;
    }

    function visibleUnlockedItems(group) {
        var out = [];
        var items = getResolvedChildren(group);
        for (var i = 0; i < items.length; i++) {
            if (isItemVisibleAndUnlocked(items[i])) out.push(items[i]);
        }
        return out;
    }

    // ---------- 处理一对页面 ----------
    function processPair(pair, stats) {
        var sortedText = sortByGrid(pair.textItems);
        var sortedImage = sortByGrid(pair.imageItems);

        for (var i = 0; i < sortedText.length; i++) {
            var tf = sortedText[i];
            var ifr = sortedImage[i];
            var name = getImageBaseName(ifr);
            if (name === null) {
                stats.skipped++;
                continue;
            }
            try {
                tf.contents = name;
                stats.written++;
            } catch (e) {
                // 写入失败时不中断,继续后续
            }
        }
        stats.pairs++;
    }

    // ---------- 取图片基础文件名(无扩展名);空框返回 null ----------
    function getImageBaseName(frame) {
        var graphics;
        try {
            graphics = frame.graphics;
        } catch (e) {
            return null;
        }
        if (!graphics || graphics.length === 0) return null;

        var g = graphics[0];
        var link = null;
        try {
            link = g.itemLink;
        } catch (e) {}
        if (!link) return null;

        var fullName = link.name;
        if (!fullName) return null;

        var dot = fullName.lastIndexOf(".");
        if (dot > 0) return fullName.substring(0, dot);
        return fullName;
    }

    // ---------- 网格排序:先行后列,行容差 3mm ----------
    function sortByGrid(items) {
        var arr = [];
        for (var i = 0; i < items.length; i++) {
            var b = items[i].geometricBounds; // [top, left, bottom, right]
            arr.push({
                item: items[i],
                top: b[0],
                left: b[1],
                cy: (b[0] + b[2]) / 2,
                cx: (b[1] + b[3]) / 2,
            });
        }

        // 1) 先按 cy 升序
        arr.sort(function (a, b) {
            return a.cy - b.cy;
        });

        // 2) 用容差分行
        var rows = [];
        var current = [arr[0]];
        for (var k = 1; k < arr.length; k++) {
            var prev = current[current.length - 1];
            if (Math.abs(arr[k].cy - prev.cy) <= ROW_TOLERANCE_MM) {
                current.push(arr[k]);
            } else {
                rows.push(current);
                current = [arr[k]];
            }
        }
        rows.push(current);

        // 3) 每行内按 cx 升序
        var sorted = [];
        for (var r = 0; r < rows.length; r++) {
            rows[r].sort(function (a, b) {
                return a.cx - b.cx;
            });
            for (var c = 0; c < rows[r].length; c++) {
                sorted.push(rows[r][c].item);
            }
        }
        return sorted;
    }
})();
