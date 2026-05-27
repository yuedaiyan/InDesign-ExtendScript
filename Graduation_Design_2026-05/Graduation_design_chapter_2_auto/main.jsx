/*
  文件: main.jsx

  用途:
  - 毕业设计第二章自动化总入口。
  - 一次生成事件 tags 标签、人物 people_tags 标签和天气 weather 文本框。

  使用前:
  - 打开毕业设计第二章 InDesign 文档。
  - 选中一个大 Group，直接子对象自上到下必须是：事件标签模板、人物标签模板、天气文本框模板。
  - 确认项目目录中存在 diary_entries.merged.json 和 diary_people_index.json。

  运行流程:
  1. 运行脚本。
  2. 按提示输入生成标签前缀、开始 JSON id 和生成范围。
  3. 脚本按跨页批次依次调用三类生成逻辑。

  注意:
  - 每个跨页批次会作为一个撤销步骤。
  - 主要配置和生成逻辑在 GraduationChapter2AutoCore.jsxinc 中。
*/
(function () {
    $.evalFile(
        new File(
            new File($.fileName).parent.fsName +
                "/GraduationChapter2AutoCore.jsxinc",
        ),
    );
    GraduationChapter2Auto.runAll();
})();
