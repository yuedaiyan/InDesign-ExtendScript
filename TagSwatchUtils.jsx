/*
  文件: TagSwatchUtils.jsx

  用途:
  - 按脚本顶部 TEMPLATE_NAME 创建一组 RGB Process 色板。

  使用前:
  - 打开要添加色板的 InDesign 文档。
  - 如需切换模板，先修改 TEMPLATE_NAME，可选 tag_colors、sample_warm 或 sample_cool。

  运行流程:
  1. 运行脚本。
  2. 脚本创建或复用对应名称的 RGB 色板。
  3. 完成后显示创建数量。

  注意:
  - 这个文件不被 GenerateTagLabelsFromJSON.jsx 引用，两者没有代码依赖。
*/
(function () {
    if (app.documents.length === 0) {
        alert("请先打开一个 InDesign 文档。");
        return;
    }

    var doc = app.activeDocument;

    // 改这里选择颜色模板：tag_colors、sample_warm 或 sample_cool。
    var TEMPLATE_NAME = "tag_colors";

    // 根据 GenerateTagLabelsFromJSON.jsx 的 TAG_COLOR_MAP 建立色板。
    var TAG_COLORS = [
        { name: "tag_bg_a2_238_135_145", rgb: [238, 135, 145] },
        { name: "tag_bg_a4_207_78_96", rgb: [207, 78, 96] },
        { name: "tag_bg_b1_248_187_122", rgb: [248, 187, 122] },
        { name: "tag_bg_b3_224_132_72", rgb: [224, 132, 72] },
        { name: "tag_bg_b4_202_106_58", rgb: [202, 106, 58] },
        { name: "tag_bg_c3_211_172_63", rgb: [211, 172, 63] },
        { name: "tag_bg_c4_188_146_48", rgb: [188, 146, 48] },
        { name: "tag_bg_d2_135_189_118", rgb: [135, 189, 118] },
        { name: "tag_bg_d4_79_139_83", rgb: [79, 139, 83] },
        { name: "tag_bg_e1_132_204_196", rgb: [132, 204, 196] },
        { name: "tag_bg_g3_137_124_164", rgb: [137, 124, 164] },
        { name: "tag_bg_g4_113_99_141", rgb: [113, 99, 141] }
    ];

    // 颜色模板示例 1：暖色标签。
    var SAMPLE_WARM = [
        { name: "tag_bg_sample_warm_pink_246_169_174", rgb: [246, 169, 174] },
        { name: "tag_bg_sample_warm_red_207_78_96", rgb: [207, 78, 96] },
        { name: "tag_bg_sample_warm_orange_239_158_91", rgb: [239, 158, 91] },
        { name: "tag_bg_sample_warm_yellow_230_195_87", rgb: [230, 195, 87] }
    ];

    // 颜色模板示例 2：冷色标签。
    var SAMPLE_COOL = [
        { name: "tag_bg_sample_cool_green_105_164_98", rgb: [105, 164, 98] },
        { name: "tag_bg_sample_cool_teal_101_181_180", rgb: [101, 181, 180] },
        { name: "tag_bg_sample_cool_blue_121_144_208", rgb: [121, 144, 208] },
        { name: "tag_bg_sample_cool_purple_137_124_164", rgb: [137, 124, 164] }
    ];

    var COLOR_TEMPLATES = {
        tag_colors: TAG_COLORS,
        sample_warm: SAMPLE_WARM,
        sample_cool: SAMPLE_COOL
    };

    function getOrCreateRgbColor(colorName, rgb) {
        var color = doc.colors.itemByName(colorName);

        try {
            color.name;
            return color;
        } catch (e1) {}

        return doc.colors.add({
            name: colorName,
            model: ColorModel.PROCESS,
            space: ColorSpace.RGB,
            colorValue: rgb
        });
    }

    function main() {
        var template = COLOR_TEMPLATES[TEMPLATE_NAME];
        if (!(template instanceof Array)) {
            alert("找不到颜色模板：" + TEMPLATE_NAME);
            return;
        }

        for (var i = 0; i < template.length; i++) {
            getOrCreateRgbColor(template[i].name, template[i].rgb);
        }

        alert(
            "色板建立完成。\n\n" +
                "模板：" +
                TEMPLATE_NAME +
                "\n数量：" +
                template.length
        );
    }

    try {
        main();
    } catch (error) {
        alert("建立色板失败：\n" + error);
    }
})();
