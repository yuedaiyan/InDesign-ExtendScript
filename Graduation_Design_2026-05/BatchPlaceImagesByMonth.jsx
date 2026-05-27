/*
  文件: BatchPlaceImagesByMonth.jsx

  用途:
  - 按 YYYY-MM-DD[_N] 图片文件名识别月份，并按月分组批量置入图片。
  - 每个新月份会复制分隔条模板并写入 YYYY-MM，空月份也会留出分隔。

  使用前:
  - 打开毕业设计 InDesign 文档。
  - 同时选中一个包含文本框的分隔条 Group 模板和一个起始空图片框。
  - 准备按日期命名的图片文件夹。

  运行流程:
  1. 运行脚本。
  2. 脚本识别模板和起始图片框。
  3. 选择图片文件夹并查看预检结果。
  4. 确认后批量置入图片并插入月份分隔条。

  注意:
  - 默认每行 6 张图片。
  - 只处理可用空图片框；已有图片、文本框、锁定对象会被跳过。
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
    var ROW_TOLERANCE = 5; // 同一行的 y 坐标容差（pt 或当前单位）
    var COLUMNS_PER_ROW = 6; // 每行图片数

    if (app.documents.length === 0) {
        alert("请先打开一个 InDesign 文档。");
        return;
    }
    var doc = app.activeDocument;

    // ====================================================================
    // 工具函数
    // ====================================================================

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

    // 从文件名提取 YYYY-MM
    function extractYearMonth(fileName) {
        var match = fileName.match(/^(\d{4})-(\d{2})/);
        if (!match) return null;
        return match[1] + "-" + match[2];
    }

    // 给定 "YYYY-MM" 字符串，返回下一个月的 "YYYY-MM"
    function nextMonth(ym) {
        var parts = ym.split("-");
        var y = parseInt(parts[0], 10);
        var m = parseInt(parts[1], 10);
        m++;
        if (m > 12) {
            m = 1;
            y++;
        }
        return y + "-" + (m < 10 ? "0" + m : "" + m);
    }

    // 判断 a 月是否早于 b 月
    function ymLessThan(a, b) {
        return a < b; // 字符串比较即可，因为格式固定
    }

    // 在一个 Group 中递归查找第一个文本框
    function findTextFrameInGroup(group) {
        try {
            if (group.textFrames && group.textFrames.length > 0) {
                return group.textFrames[0];
            }
        } catch (e) {}
        // 递归查找嵌套的 Group
        try {
            for (var i = 0; i < group.groups.length; i++) {
                var found = findTextFrameInGroup(group.groups[i]);
                if (found) return found;
            }
        } catch (e) {}
        return null;
    }

    // ====================================================================
    // 阶段 1：从当前选区中识别模板分隔条 + 起始图片框
    //
    // 用户需要在运行脚本前同时选中两个对象（按住 Shift 多选）：
    //   1. 一个 Group（分隔条模板：线 + 文本框）
    //   2. 一个空白图片框（Rectangle / Oval / Polygon，作为起始位置）
    // 顺序无所谓。
    // ====================================================================

    function tryGetGraphicFrame(sel) {
        var t = sel.constructor.name;
        if (t === "Rectangle" || t === "Oval" || t === "Polygon") {
            return isEmptyGraphicFrame(sel) ? sel : null;
        }
        if (
            t === "Image" ||
            t === "PDF" ||
            t === "EPS" ||
            t === "Graphic" ||
            t === "WMF"
        ) {
            try {
                if (isEmptyGraphicFrame(sel.parent)) return sel.parent;
            } catch (e) {}
        }
        return null;
    }

    var templateGroup = null;
    var templateTextFrame = null;
    var startFrame = null;
    var selectionDiag = "";

    if (app.selection.length === 0) {
        selectionDiag = "未选中任何对象。";
    } else if (app.selection.length === 1) {
        // 单选：分情况判断
        var only = app.selection[0];
        if (only.constructor.name === "Group") {
            selectionDiag =
                "只选中了 Group（分隔条模板），还需要同时选中一个起始图片框。";
        } else if (tryGetGraphicFrame(only)) {
            selectionDiag =
                "只选中了图片框，还需要同时选中分隔条模板（Group）。";
        } else {
            selectionDiag =
                "选中的对象类型 " + only.constructor.name + " 不符合要求。";
        }
    } else if (app.selection.length === 2) {
        for (var s = 0; s < 2; s++) {
            var item = app.selection[s];
            if (item.constructor.name === "Group" && !templateGroup) {
                var tf = findTextFrameInGroup(item);
                if (tf) {
                    templateGroup = item;
                    templateTextFrame = tf;
                }
            } else if (!startFrame) {
                var f = tryGetGraphicFrame(item);
                if (f) startFrame = f;
            }
        }
        if (!templateGroup)
            selectionDiag = "未在选区中找到合适的 Group 模板（含文本框）。";
        else if (!startFrame)
            selectionDiag = "未在选区中找到合适的空白图片框。";
    } else {
        selectionDiag =
            "选中了 " +
            app.selection.length +
            " 个对象，请只选中 2 个：1 个分隔条 Group + 1 个空白图片框。";
    }

    if (!templateGroup || !startFrame) {
        var helpMsg =
            "无法识别模板和起始框。\n\n" +
            "状态：" +
            selectionDiag +
            "\n\n" +
            "操作步骤：\n" +
            "1. 在文档中点击你的分隔条 Group（线 + 文本框）\n" +
            "2. 按住 Shift 再点击一个空白图片框（作为起始位置）\n" +
            "3. 现在选区里应该有 2 个对象\n" +
            "4. 重新运行脚本";
        alert(helpMsg);
        return;
    }

    var templateBounds = templateGroup.geometricBounds; // [y1, x1, y2, x2]

    // 把检测信息收集起来，留到最后的预检报告里一起显示
    var detectionInfo = "";
    detectionInfo += "✓ 模板分隔条: Group\n";
    try {
        detectionInfo += '  - 当前文本: "' + templateTextFrame.contents + '"\n';
    } catch (e) {}
    try {
        detectionInfo +=
            "  - 位置: x=" +
            templateBounds[1].toFixed(2) +
            "  y=" +
            templateBounds[0].toFixed(2) +
            "\n";
    } catch (e) {}
    detectionInfo += "✓ 起始图片框: " + startFrame.constructor.name;
    try {
        detectionInfo += "（第 " + startFrame.parentPage.name + " 页）";
    } catch (e) {}
    detectionInfo += "\n";

    // ====================================================================
    // 收集所有空白图片框（按页面 → 行 → 列排序）
    // ====================================================================

    var emptyFrames = [];

    for (var p = 0; p < doc.pages.length; p++) {
        var page = doc.pages[p];
        var pageFrames = [];
        var allItems = page.allPageItems;
        for (var k = 0; k < allItems.length; k++) {
            if (isEmptyGraphicFrame(allItems[k])) {
                pageFrames.push(allItems[k]);
            }
        }
        pageFrames.sort(function (a, b) {
            var ay = a.geometricBounds[0];
            var ax = a.geometricBounds[1];
            var by = b.geometricBounds[0];
            var bx = b.geometricBounds[1];
            if (Math.abs(ay - by) < ROW_TOLERANCE) return ax - bx;
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

    // 找到起始框在 emptyFrames 中的索引
    var startIndex = -1;
    for (var si = 0; si < emptyFrames.length; si++) {
        if (emptyFrames[si] === startFrame) {
            startIndex = si;
            break;
        }
    }
    if (startIndex === -1) {
        alert("起始框不在可用空白框列表中。请检查是否被锁定或所在图层被锁。");
        return;
    }

    // ====================================================================
    // 选择文件夹 + 收集图片
    // ====================================================================

    var folder = Folder.selectDialog("请选择存放图片的文件夹");
    if (folder === null) return;

    var allFiles = folder.getFiles();
    var imageFiles = [];
    for (var i = 0; i < allFiles.length; i++) {
        var f = allFiles[i];
        if (f instanceof File) {
            var nameLower = f.name.toLowerCase();
            for (var j = 0; j < SUPPORTED_EXTENSIONS.length; j++) {
                var ext = SUPPORTED_EXTENSIONS[j];
                if (
                    nameLower.lastIndexOf(ext) ===
                    nameLower.length - ext.length
                ) {
                    if (extractYearMonth(f.name) !== null) {
                        imageFiles.push(f);
                    }
                    break;
                }
            }
        }
    }

    if (imageFiles.length === 0) {
        alert("所选文件夹内没有找到符合 YYYY-MM-DD 命名规则的图片文件。");
        return;
    }

    imageFiles.sort(function (a, b) {
        if (a.name < b.name) return -1;
        if (a.name > b.name) return 1;
        return 0;
    });

    // ====================================================================
    // 关键步骤：构建"占格计划"
    //
    // 我们要为本次置入构建一个虚拟的占格序列，每个槽位是以下三种之一：
    //   { type: "image", file: <File>, frameIndex: <int> }
    //   { type: "skip",  frameIndex: <int> }              // 月末/空月留空的格子
    //   { type: "separator", ymLabel: "YYYY-MM",
    //     anchorFrameIndex: <int> }                       // 分隔条贴在这个 frame 的上方
    //
    // 规则：
    // - 第一个月开始前先放一个 separator
    // - 每张图占一个 frame（自起始框起的 emptyFrames）
    // - 月份切换时，把当前行剩余格子标 skip，然后在下一行第一个 frame 上方加 separator
    // - 空月份：放 separator + 占用整行 6 个 skip 槽位
    // ====================================================================

    var firstYM = extractYearMonth(imageFiles[0].name);
    var lastYM = extractYearMonth(imageFiles[imageFiles.length - 1].name);

    // 把图片按月分桶
    var monthBuckets = {}; // "YYYY-MM" -> [File, File, ...]
    var monthOrder = [];
    for (var ii = 0; ii < imageFiles.length; ii++) {
        var ym = extractYearMonth(imageFiles[ii].name);
        if (!monthBuckets[ym]) {
            monthBuckets[ym] = [];
            monthOrder.push(ym);
        }
        monthBuckets[ym].push(imageFiles[ii]);
    }

    // 构建从 firstYM 到 lastYM 的连续月份列表（包括空月份）
    var allMonths = [];
    var cur = firstYM;
    while (true) {
        allMonths.push(cur);
        if (cur === lastYM) break;
        cur = nextMonth(cur);
        // 安全保护：避免死循环
        if (allMonths.length > 1200) {
            alert("月份范围异常（超过 100 年），请检查文件名。");
            return;
        }
    }

    // 模拟器：当前指针在 emptyFrames 的偏移（相对 startIndex）
    // colInRow 表示当前行已经占用了几个槽位（image 或 skip）
    var plan = [];
    var cursor = 0; // 相对 startIndex 的偏移
    var colInRow = 0; // 当前行已占用的列数（0..5）

    function pushSkip() {
        plan.push({ type: "skip", frameIndex: startIndex + cursor });
        cursor++;
        colInRow++;
        if (colInRow >= COLUMNS_PER_ROW) colInRow = 0;
    }

    function pushImage(file) {
        plan.push({
            type: "image",
            file: file,
            frameIndex: startIndex + cursor,
        });
        cursor++;
        colInRow++;
        if (colInRow >= COLUMNS_PER_ROW) colInRow = 0;
    }

    function fillRowToEnd() {
        // 把当前行剩余的格子都 skip 掉
        while (colInRow !== 0) {
            pushSkip();
        }
    }

    function pushSeparator(ymLabel) {
        // 分隔条挂在"下一个即将被使用的 frame"的上方
        plan.push({
            type: "separator",
            ymLabel: ymLabel,
            anchorFrameIndex: startIndex + cursor,
        });
    }

    for (var mi = 0; mi < allMonths.length; mi++) {
        var thisYM = allMonths[mi];
        var bucket = monthBuckets[thisYM]; // 可能 undefined（空月）

        // 对于非第一个月：先把上个月的当前行填满
        if (mi > 0) {
            fillRowToEnd();
        }

        // 月份分隔条（每个月都加，包括第一个月和空月）
        pushSeparator(thisYM);

        if (bucket && bucket.length > 0) {
            // 正常月份：依次放入图片
            for (var bi = 0; bi < bucket.length; bi++) {
                pushImage(bucket[bi]);
            }
        } else {
            // 空月份：占用整行 6 个 skip 槽位
            for (var sk = 0; sk < COLUMNS_PER_ROW; sk++) {
                pushSkip();
            }
        }
    }

    // ====================================================================
    // 预检：检查空白框数量是否够用
    // ====================================================================

    var requiredSlots = cursor; // 需要的槽位总数
    var availableSlots = emptyFrames.length - startIndex;
    var imageCount = imageFiles.length;
    var emptyMonthCount = 0;
    for (var em = 0; em < allMonths.length; em++) {
        if (!monthBuckets[allMonths[em]]) emptyMonthCount++;
    }
    var separatorCount = allMonths.length;

    var imagesPlannedToPlace = Math.min(imageCount, requiredSlots); // 实际能置入的图片数
    var canPlaceAll = requiredSlots <= availableSlots;

    var preReport =
        detectionInfo +
        "\n图片总数: " +
        imageCount +
        " 张\n" +
        "月份范围: " +
        firstYM +
        " 至 " +
        lastYM +
        " (共 " +
        allMonths.length +
        " 个月)\n" +
        "  其中空月份: " +
        emptyMonthCount +
        " 个\n" +
        "分隔条数量: " +
        separatorCount +
        " 个\n\n" +
        "需要的图片框槽位: " +
        requiredSlots +
        " 个\n" +
        "起始位置之后可用槽位: " +
        availableSlots +
        " 个\n";

    if (!canPlaceAll) {
        preReport += "\n⚠ 警告: 空白图片框不足，将只能置入前 ";
        // 计算实际能置入的图片数（按 plan 里 image 的累计）
        var placeable = 0;
        for (var pi = 0; pi < plan.length; pi++) {
            if (
                plan[pi].type === "image" &&
                plan[pi].frameIndex - startIndex < availableSlots
            ) {
                placeable++;
            }
        }
        preReport +=
            placeable +
            " 张图片，剩余 " +
            (imageCount - placeable) +
            " 张将被跳过。\n";
        preReport += "建议: 增加文档页面或图片框后重试。\n";
    } else {
        preReport += "\n✓ 框数充足，可以全部置入。\n";
    }

    preReport += "\n是否继续?";

    // ====================================================================
    // 适配方式 + 最终确认
    // ====================================================================

    var dlg3 = new Window("dialog", "步骤 3 / 3 — 预检报告与最终确认");
    dlg3.orientation = "column";
    dlg3.alignChildren = "fill";

    var p3 = dlg3.add("panel", undefined, "预检报告");
    p3.margins = 12;
    p3.alignChildren = "left";
    var t3 = p3.add("statictext", undefined, preReport, { multiline: true });
    t3.characters = 60;

    var fitPanel = dlg3.add("panel", undefined, "适配方式");
    fitPanel.orientation = "column";
    fitPanel.alignChildren = "left";
    fitPanel.margins = 12;
    var fitFill = fitPanel.add(
        "radiobutton",
        undefined,
        "按比例填充框（可能裁切边缘）",
    );
    var fitProp = fitPanel.add(
        "radiobutton",
        undefined,
        "按比例适合（完整显示，可能留白）",
    );
    fitFill.value = true;

    var btn3 = dlg3.add("group");
    btn3.alignment = "right";
    btn3.add("button", undefined, "执行置入", { name: "ok" });
    btn3.add("button", undefined, "取消", { name: "cancel" });

    if (dlg3.show() !== 1) return;

    var fitMode = fitFill.value
        ? FitOptions.FILL_PROPORTIONALLY
        : FitOptions.PROPORTIONALLY;

    // ====================================================================
    // 执行：按 plan 置入图片 + 复制分隔条
    // ====================================================================

    var successCount = 0;
    var failedList = [];
    var separatorPlacedCount = 0;
    var skippedDueToNoFrame = 0;

    // 模板 group 的水平位置（x1）和宽度，将被复用
    // templateBounds = [y1, x1, y2, x2]
    var tplY1 = templateBounds[0];
    var tplX1 = templateBounds[1];
    var tplY2 = templateBounds[2];
    var tplX2 = templateBounds[3];
    var tplHeight = tplY2 - tplY1;

    app.doScript(
        function () {
            app.scriptPreferences.enableRedraw = false;
            try {
                for (var n = 0; n < plan.length; n++) {
                    var step = plan[n];

                    if (step.type === "image") {
                        if (step.frameIndex >= emptyFrames.length) {
                            skippedDueToNoFrame++;
                            continue;
                        }
                        var frame = emptyFrames[step.frameIndex];
                        try {
                            frame.place(step.file);
                            if (frame.graphics.length > 0) {
                                frame.fit(fitMode);
                                if (
                                    fitMode === FitOptions.FILL_PROPORTIONALLY
                                ) {
                                    frame.fit(FitOptions.CENTER_CONTENT);
                                }
                            }
                            successCount++;
                        } catch (err) {
                            failedList.push(
                                step.file.name + " → " + err.message,
                            );
                        }
                    } else if (step.type === "skip") {
                        // 占位，无操作
                    } else if (step.type === "separator") {
                        if (step.anchorFrameIndex >= emptyFrames.length) {
                            // 锚点框不存在（已经超出文档），跳过分隔条
                            continue;
                        }
                        var anchorFrame = emptyFrames[step.anchorFrameIndex];
                        var anchorBounds = anchorFrame.geometricBounds; // [y1, x1, y2, x2]
                        var anchorY1 = anchorBounds[0];

                        // 复制模板
                        var newSep;
                        try {
                            newSep = templateGroup.duplicate();
                        } catch (err) {
                            failedList.push(
                                "分隔条 " +
                                    step.ymLabel +
                                    " 复制失败: " +
                                    err.message,
                            );
                            continue;
                        }

                        // 计算新位置：水平复用模板的 x，垂直贴住锚点框的顶部
                        // 新分隔条底边 = anchorY1（贴住），所以顶边 = anchorY1 - tplHeight
                        var newY1 = anchorY1 - tplHeight;
                        var newY2 = anchorY1;
                        var newX1 = tplX1;
                        var newX2 = tplX2;

                        try {
                            newSep.geometricBounds = [
                                newY1,
                                newX1,
                                newY2,
                                newX2,
                            ];
                        } catch (err) {
                            failedList.push(
                                "分隔条 " +
                                    step.ymLabel +
                                    " 定位失败: " +
                                    err.message,
                            );
                            try {
                                newSep.remove();
                            } catch (e) {}
                            continue;
                        }

                        // 把新分隔条移动到锚点框所在页（如果不一致）
                        try {
                            var targetPage = anchorFrame.parentPage;
                            if (
                                targetPage &&
                                newSep.parentPage !== targetPage
                            ) {
                                newSep.move(targetPage);
                                // 移动到新页后位置可能被重置，重新设一次 bounds
                                newSep.geometricBounds = [
                                    newY1,
                                    newX1,
                                    newY2,
                                    newX2,
                                ];
                            }
                        } catch (err) {}

                        // 修改文本框内容
                        try {
                            var newTextFrame = findTextFrameInGroup(newSep);
                            if (newTextFrame) {
                                newTextFrame.contents = step.ymLabel;
                            }
                        } catch (err) {
                            failedList.push(
                                "分隔条 " +
                                    step.ymLabel +
                                    " 文本修改失败: " +
                                    err.message,
                            );
                        }

                        separatorPlacedCount++;
                    }
                }
            } finally {
                app.scriptPreferences.enableRedraw = true;
            }
        },
        ScriptLanguage.JAVASCRIPT,
        undefined,
        UndoModes.ENTIRE_SCRIPT,
        "批量置入图片(按月分组)",
    );

    // ====================================================================
    // 报告
    // ====================================================================

    var report = "完成！\n\n";
    report += "成功置入图片: " + successCount + " 张\n";
    report += "成功放置分隔条: " + separatorPlacedCount + " 个\n";
    if (skippedDueToNoFrame > 0) {
        report += "因空白框不足跳过: " + skippedDueToNoFrame + " 张图片\n";
    }
    if (failedList.length > 0) {
        report += "失败: " + failedList.length + " 项\n\n失败列表:\n";
        var showCount = Math.min(failedList.length, 20);
        for (var q = 0; q < showCount; q++) {
            report += "• " + failedList[q] + "\n";
        }
        if (failedList.length > 20) {
            report += "... 还有 " + (failedList.length - 20) + " 条未显示";
        }
    }
    if (successCount > 0 || separatorPlacedCount > 0) {
        report += "\n💡 如需撤销，按一次 Cmd+Z 即可全部撤销。";
    }
    alert(report);
})();
