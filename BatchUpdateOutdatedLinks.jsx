/*
  文件: BatchUpdateOutdatedLinks.jsx

  用途:
  - 分批更新当前文档中状态为“需要更新 / LINK_OUT_OF_DATE”的链接。

  使用前:
  - 打开包含待更新链接的 InDesign 文档。
  - 建议先保存文档。

  运行流程:
  1. 运行脚本。
  2. 脚本扫描当前文档中需要更新的链接。
  3. 查看总数量、批次数和第一批预览。
  4. 确认后自动按每 100 个一批更新，直到扫描到的待更新链接都处理完。

  注意:
  - 每 100 个链接会包装为一次撤销操作，避免把 6000 多个链接塞进同一个超大撤销事务。
  - 如果处理了很多批，撤销时需要按批次多次 Cmd+Z。
  - 脚本默认只处理 LINK_OUT_OF_DATE，不处理缺失链接或已正常链接。
*/
function main() {
    var BATCH_SIZE = 100;
    var PAUSE_MS_BETWEEN_BATCHES = 300;

    if (app.documents.length === 0) {
        alert("请先打开一个 InDesign 文档。");
        return;
    }

    var doc = app.activeDocument;
    var links = getDocumentLinks(doc);
    if (links.length === 0) {
        alert("当前文档没有链接。");
        return;
    }

    var scan = collectOutdatedLinks(links);
    if (scan.items.length === 0) {
        var noUpdateMsg =
            "当前文档没有找到需要更新的链接。\n\n" +
            "文档链接总数: " +
            links.length +
            " 个";
        noUpdateMsg += buildStatusSummary(scan.statusCounts);
        alert(noUpdateMsg);
        return;
    }

    var batches = buildBatches(scan.items, BATCH_SIZE);

    var confirmMsg =
        "文档链接总数: " +
        links.length +
        " 个\n" +
        "检测到待更新链接: " +
        scan.items.length +
        " 个\n" +
        "每批处理: " +
        BATCH_SIZE +
        " 个\n" +
        "将自动执行批次: " +
        batches.length +
        " 批\n";
    confirmMsg += buildStatusSummary(scan.statusCounts);
    confirmMsg += "\n\n第一批预览:\n" + buildLinkPreview(batches[0], 15);
    confirmMsg +=
        "\n\n注意：脚本会自动跑完所有批次，但每 100 个链接是一个单独撤销步骤。" +
        "\n如果要撤销全部批次，需要连续按多次 Cmd+Z。";
    confirmMsg += "\n\n是否继续自动更新全部待更新链接？";

    if (!confirm(confirmMsg)) return;

    var result = {
        success: 0,
        failed: [],
        batchCount: 0
    };

    for (var batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        updateOneBatch(batches[batchIndex], batchIndex + 1, batches.length, result);

        if (PAUSE_MS_BETWEEN_BATCHES > 0 && batchIndex < batches.length - 1) {
            try {
                $.sleep(PAUSE_MS_BETWEEN_BATCHES);
            } catch (sleepErr) {}
        }
    }

    var report =
        "全部批次处理完成。\n\n" +
        "检测到待更新链接: " +
        scan.items.length +
        " 个\n" +
        "已执行批次: " +
        result.batchCount +
        " 批\n" +
        "成功更新: " +
        result.success +
        " 个\n" +
        "更新失败: " +
        result.failed.length +
        " 个\n";

    if (result.failed.length > 0) {
        report += "\n失败明细:\n" + listPreview(result.failed, 20);
    }

    report +=
        "\n\n本脚本按每 " +
        BATCH_SIZE +
        " 个链接建立一个撤销步骤；如需全部撤销，请按批次数连续撤销。";
    alert(report);
}

function updateOneBatch(batch, batchNumber, totalBatches, result) {
    app.doScript(
        function () {
            var oldRedraw = app.scriptPreferences.enableRedraw;
            var oldUserInteraction = app.scriptPreferences.userInteractionLevel;

            app.scriptPreferences.enableRedraw = false;
            app.scriptPreferences.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;

            try {
                for (var i = 0; i < batch.length; i++) {
                    try {
                        batch[i].link.update();
                        result.success++;
                    } catch (updateErr) {
                        result.failed.push(
                            "第 " + batchNumber + "/" + totalBatches + " 批 - " + batch[i].name + " - " + updateErr.message
                        );
                    }
                }
                result.batchCount++;
            } finally {
                app.scriptPreferences.userInteractionLevel = oldUserInteraction;
                app.scriptPreferences.enableRedraw = oldRedraw;
            }
        },
        ScriptLanguage.JAVASCRIPT,
        undefined,
        UndoModes.ENTIRE_SCRIPT,
        "分批更新链接 " + batchNumber + "/" + totalBatches
    );
}

function getDocumentLinks(doc) {
    try {
        return doc.links.everyItem().getElements();
    } catch (e1) {
        var links = [];
        try {
            for (var i = 0; i < doc.links.length; i++) {
                links.push(doc.links[i]);
            }
        } catch (e2) {}
        return links;
    }
}

function buildBatches(items, batchSize) {
    var batches = [];
    var currentBatch = [];

    for (var i = 0; i < items.length; i++) {
        currentBatch.push(items[i]);
        if (currentBatch.length === batchSize) {
            batches.push(currentBatch);
            currentBatch = [];
        }
    }

    if (currentBatch.length > 0) {
        batches.push(currentBatch);
    }

    return batches;
}

function collectOutdatedLinks(links) {
    var result = {
        items: [],
        statusCounts: {}
    };

    for (var i = 0; i < links.length; i++) {
        var link = links[i];
        var statusText = getLinkStatusText(link);
        addStatusCount(result.statusCounts, statusText);

        if (!isOutdatedStatus(statusText, link)) continue;

        result.items.push({
            link: link,
            name: safeLinkName(link),
            path: safeLinkPath(link),
            statusText: statusText
        });
    }

    return result;
}

function isOutdatedStatus(statusText, link) {
    try {
        if (link.status === LinkStatus.LINK_OUT_OF_DATE) return true;
    } catch (e1) {}

    return statusText.indexOf("LINK_OUT_OF_DATE") >= 0 || statusText.indexOf("OUT_OF_DATE") >= 0;
}

function getLinkStatusText(link) {
    try {
        return String(link.status);
    } catch (e1) {}
    return "STATUS_UNKNOWN";
}

function addStatusCount(statusCounts, statusText) {
    if (!statusCounts[statusText]) {
        statusCounts[statusText] = 0;
    }
    statusCounts[statusText]++;
}

function buildStatusSummary(statusCounts) {
    var lines = [];
    for (var key in statusCounts) {
        if (statusCounts.hasOwnProperty(key)) {
            lines.push(key + ": " + statusCounts[key]);
        }
    }
    lines.sort();

    if (lines.length === 0) return "";
    return "\n\n链接状态统计:\n" + lines.join("\n");
}

function buildLinkPreview(items, limit) {
    var lines = [];
    var count = Math.min(items.length, limit);

    for (var i = 0; i < count; i++) {
        lines.push(i + 1 + ". " + items[i].name);
    }

    if (items.length > limit) {
        lines.push("... 还有 " + (items.length - limit) + " 个未显示");
    }

    return lines.join("\n");
}

function listPreview(items, limit) {
    var lines = [];
    var count = Math.min(items.length, limit);

    for (var i = 0; i < count; i++) {
        lines.push("- " + items[i]);
    }

    if (items.length > limit) {
        lines.push("- ... 还有 " + (items.length - limit) + " 项未显示");
    }

    return lines.join("\n");
}

function safeLinkName(link) {
    try {
        var name = trim(link.name);
        if (name !== "") return name;
    } catch (e1) {}
    return "未命名链接";
}

function safeLinkPath(link) {
    try {
        return String(link.filePath);
    } catch (e1) {}
    return "";
}

function trim(text) {
    return String(text).replace(/^\s+|\s+$/g, "");
}

try {
    main();
} catch (err) {
    var lineText = err && err.line ? "\n\n行号：" + err.line : "";
    var message = err && err.message ? err.message : String(err);
    alert("分批更新链接失败：\n\n" + message + lineText);
}
