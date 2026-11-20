import * as decisionBanners from "../checks/decision-banners.mjs";
import * as designTokens from "../checks/design-tokens.mjs";
import * as docSymbols from "../checks/doc-symbols.mjs";
import * as journal from "../checks/journal.mjs";
import * as noHorizontalScroll from "../checks/no-horizontal-scroll.mjs";
import * as reactCompiler from "../checks/react-compiler.mjs";
import * as uiBarrel from "../checks/ui-barrel.mjs";

/** 검사 이름 → 모듈. 이름은 앱 package.json 의 `check:<이름>` 과 harness.config.json `checks.<이름>` 에 그대로 쓰인다. */
export const CHECKS = Object.fromEntries(
	[journal, designTokens, reactCompiler, noHorizontalScroll, docSymbols, uiBarrel, decisionBanners].map((m) => [m.name, m]),
);
