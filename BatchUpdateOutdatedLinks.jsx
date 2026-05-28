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
  3. 查看待更新总数和本批 100 个链接的预览。
  4. 确认后只更新本批 100 个链接，然后结束脚本。

  注意:
  - 本批 100 个链接会包装为一次撤销操作。
  - 不在脚本内部自动循环到全部完成，因为 InDesign 会长时间占住主线程，看起来像卡死。
  - 要继续处理剩余链接，请再次运行脚本。
  - 脚本默认只处理 LINK_OUT_OF_DATE，不处理缺失链接或已正常链接。
*/
function main() {
    var BATCH_SIZE = 300;

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

    var batch = buildFirstBatch(scan.items, BATCH_SIZE);

    var confirmMsg =
        "文档链接总数: " +
        links.length +
        " 个\n" +
        "检测到待更新链接: " +
        scan.items.length +
        " 个\n" +
        "本次将更新: " +
        batch.length +
        " 个\n";
    confirmMsg += buildStatusSummary(scan.statusCounts);
    confirmMsg += "\n\n本批预览:\n" + buildLinkPreview(batch, 15);
    if (scan.items.length > batch.length) {
        confirmMsg +=
            "\n\n本次完成后还会剩余约 " +
            (scan.items.length - batch.length) +
            " 个待更新链接。为了避免卡死，脚本不会自动继续；请再次运行脚本处理下一批。";
    }
    confirmMsg += "\n\n是否继续更新本批链接？";

    if (!confirm(confirmMsg)) return;

    var result = {
        success: 0,
        failed: [],
    };

    updateOneBatch(batch, result);

    var report =
        "本批链接更新完成。\n\n" +
        "检测到待更新链接: " +
        scan.items.length +
        " 个\n" +
        "本批计划更新: " +
        batch.length +
        " 个\n" +
        "成功更新: " +
        result.success +
        " 个\n" +
        "更新失败: " +
        result.failed.length +
        " 个\n";

    if (result.failed.length > 0) {
        report += "\n失败明细:\n" + listPreview(result.failed, 20);
    }

    if (scan.items.length > batch.length) {
        report +=
            "\n\n运行前检测到剩余待更新链接约 " +
            (scan.items.length - batch.length) +
            " 个。再次运行脚本会重新扫描并处理下一批。";
    }

    report += "\n\n需要撤销时，按一次 Cmd+Z 即可撤销本批更新。";
    alert(report);
}

function updateOneBatch(batch, result) {
    app.doScript(
        function () {
            var oldRedraw = app.scriptPreferences.enableRedraw;
            var oldUserInteraction = app.scriptPreferences.userInteractionLevel;

            app.scriptPreferences.enableRedraw = false;
            app.scriptPreferences.userInteractionLevel =
                UserInteractionLevels.NEVER_INTERACT;

            try {
                for (var i = 0; i < batch.length; i++) {
                    try {
                        batch[i].link.update();
                        result.success++;
                    } catch (updateErr) {
                        result.failed.push(
                            batch[i].name + " - " + updateErr.message,
                        );
                    }
                }
            } finally {
                app.scriptPreferences.userInteractionLevel = oldUserInteraction;
                app.scriptPreferences.enableRedraw = oldRedraw;
            }
        },
        ScriptLanguage.JAVASCRIPT,
        undefined,
        UndoModes.ENTIRE_SCRIPT,
        "分批更新链接",
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

function buildFirstBatch(items, batchSize) {
    var batch = [];
    var count = Math.min(items.length, batchSize);

    for (var i = 0; i < count; i++) {
        batch.push(items[i]);
    }

    return batch;
}

function collectOutdatedLinks(links) {
    var result = {
        items: [],
        statusCounts: {},
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
            statusText: statusText,
        });
    }

    return result;
}

function isOutdatedStatus(statusText, link) {
    try {
        if (link.status === LinkStatus.LINK_OUT_OF_DATE) return true;
    } catch (e1) {}

    return (
        statusText.indexOf("LINK_OUT_OF_DATE") >= 0 ||
        statusText.indexOf("OUT_OF_DATE") >= 0
    );
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
