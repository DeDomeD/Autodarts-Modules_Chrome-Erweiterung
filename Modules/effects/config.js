(function initEffectsModuleConfig(scope) {
  const configs = scope.AD_SB_MODULE_CONFIGS || (scope.AD_SB_MODULE_CONFIGS = {});
  configs.effects = {
    id: "effects",
    defaults: {
      enableMiss: true,
      missGuardOnDoubleOut: true,
      missGuardThreshold: 40,
      customEffectsJson: "[]",
      enableSpecialMiss: true,
      enableDouble: true,
      enableTriple: true,
      enableBull: true,
      enableDBull: true,
      enableT20: true,
      enableT19: true,
      enableT18: true,
      enableT17: true,
      enableHigh100: true,
      enableHigh140: true,
      enable180: true,
      enableNoScore: true,
      enableWaschmaschine: true,
      enableBust: true,
      enableWinner: true,
      enableCorrection: true,
      enableMyTurnStart: true,
      enableOpponentTurnStart: true
    },
    actionDefaults: {
      miss: "Miss",
      dbl: "Double",
      tpl: "Triple",
      bull: "Bull",
      dbull: "DBull",
      t20: "T20",
      t19: "T19",
      t18: "T18",
      t17: "T17",
      high100: "High 100",
      high140: "High 140",
      oneeighty: "180",
      noScore: "No Score",
      waschmaschine: "Waschmaschine",
      bust: "Bust",
      winner: "Winner",
      specialMiss: "Special Miss",
      correction: "Korrektur",
      myTurnStart: "My Turn Start",
      opponentTurnStart: "Opponent Turn Start"
    },
    ini: {
      togglesBool: [
        "enableMiss",
        "missGuardOnDoubleOut",
        "enableSpecialMiss",
        "enableDouble",
        "enableTriple",
        "enableBull",
        "enableDBull",
        "enableT20",
        "enableT19",
        "enableT18",
        "enableT17",
        "enableHigh100",
        "enableHigh140",
        "enable180",
        "enableNoScore",
        "enableWaschmaschine",
        "enableBust",
        "enableWinner",
        "enableCorrection",
        "enableMyTurnStart",
        "enableOpponentTurnStart"
      ],
      togglesNumber: {
        missGuardThreshold: 40
      },
      modulesConfigString: {
        customEffectsJson: "[]"
      }
    }
  };
})(globalThis);
