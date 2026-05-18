/*
  GeneratePeopleTagLabelsFromJSON.jsx

  单独运行人物 / people_tags 编号标签生成逻辑。
  共享实现见 GraduationChapter2AutoCore.jsxinc。
*/

(function () {
    $.evalFile(new File(new File($.fileName).parent.fsName + "/GraduationChapter2AutoCore.jsxinc"));
    GraduationChapter2Auto.runStandalone("people");
})();
