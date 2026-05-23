/*
  GenerateTagLabelsFromJSON.jsx

  单独运行事件 / tags 标签生成逻辑。
  共享实现见 GraduationChapter2AutoCore.jsxinc。
*/

(function () {
    $.evalFile(new File(new File($.fileName).parent.fsName + "/GraduationChapter2AutoCore.jsxinc"));
    GraduationChapter2Auto.runStandalone("tags");
})();
