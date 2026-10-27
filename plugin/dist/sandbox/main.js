(function() {
  "use strict";
  async function readDocument() {
    const [collections, variables, paintStyles, textStyles, effectStyles] = await Promise.all([
      figma.variables.getLocalVariableCollectionsAsync(),
      figma.variables.getLocalVariablesAsync(),
      figma.getLocalPaintStylesAsync(),
      figma.getLocalTextStylesAsync(),
      figma.getLocalEffectStylesAsync()
    ]);
    const space = figma.root.documentColorProfile;
    const localVariableIds = new Set(variables.map((v) => v.id));
    const variablesByCollection = /* @__PURE__ */ new Map();
    for (const variable of variables) {
      const bucket = variablesByCollection.get(variable.variableCollectionId);
      if (bucket) bucket.push(variable);
      else variablesByCollection.set(variable.variableCollectionId, [variable]);
    }
    const irCollections = collections.map((collection) => ({
      id: collection.id,
      ...keyOf(collection),
      name: collection.name,
      modes: collection.modes.map((mode) => ({ id: mode.modeId, name: mode.name })),
      defaultModeId: collection.defaultModeId,
      variables: (variablesByCollection.get(collection.id) ?? []).map(
        (v) => readVariable(v, localVariableIds, space)
      ),
      ...extensionOf(collection)
    }));
    const irPaintStyles = paintStyles.map((s) => readPaintStyle(s, space));
    const irTextStyles = textStyles.map((s) => readTextStyle(s, space));
    const irEffectStyles = effectStyles.map((s) => readEffectStyle(s, space));
    const libraryVariables = await readLibraryVariables(
      referencedIds(irCollections, irPaintStyles, irTextStyles, irEffectStyles),
      localVariableIds,
      space
    );
    return {
      collections: irCollections,
      paintStyles: irPaintStyles,
      textStyles: irTextStyles,
      effectStyles: irEffectStyles,
      fileName: figma.root.name,
      ...libraryVariables.length > 0 ? { libraryVariables } : {}
    };
  }
  function referencedIds(collections, paintStyles, textStyles, effectStyles) {
    const ids = /* @__PURE__ */ new Set();
    for (const collection of collections) {
      for (const variable of collection.variables) for (const id of valueTargets(variable.valuesByMode)) ids.add(id);
    }
    for (const style of paintStyles) {
      for (const paint of style.paints) {
        if (paint.kind === "solid" && paint.colorVarId) ids.add(paint.colorVarId);
        if (paint.kind === "gradient") {
          for (const stop of paint.stops) if (stop.colorVarId) ids.add(stop.colorVarId);
        }
      }
    }
    for (const style of textStyles) {
      for (const id of Object.values(style.props.boundVariables)) ids.add(id);
      const decorationId = style.props.extras.decoration?.colorVarId;
      if (decorationId) ids.add(decorationId);
    }
    for (const style of effectStyles) {
      for (const effect of style.effects) {
        if (effect.kind !== "unsupported") for (const id of Object.values(effect.boundVariables)) ids.add(id);
      }
    }
    return ids;
  }
  function valueTargets(valuesByMode) {
    const ids = [];
    for (const value of Object.values(valuesByMode)) {
      if (value.kind === "alias") ids.push(value.targetId);
      if (value.kind === "composed-color") {
        if (value.colorArg.kind === "alias") ids.push(value.colorArg.targetId);
        if (value.opacityArg.kind === "alias") ids.push(value.opacityArg.targetId);
      }
    }
    return ids;
  }
  async function readLibraryVariables(referenced, localVariableIds, space) {
    const collections = /* @__PURE__ */ new Map();
    const collectionOf = (id) => {
      let pending = collections.get(id);
      if (!pending) {
        pending = readLibraryCollection(id);
        collections.set(id, pending);
      }
      return pending;
    };
    const seen = /* @__PURE__ */ new Set();
    const out = [];
    let next = [...referenced].filter((id) => !localVariableIds.has(id));
    while (next.length > 0) {
      for (const id of next) seen.add(id);
      const found = await Promise.all(next.map((id) => readLibraryVariable(id, localVariableIds, space, collectionOf)));
      out.push(...found);
      next = [
        ...new Set(found.flatMap((v) => v.found ? valueTargets(v.valuesByMode) : []))
      ].filter((id) => !localVariableIds.has(id) && !seen.has(id));
    }
    return out.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  }
  async function readLibraryVariable(id, localVariableIds, space, collectionOf) {
    let variable;
    try {
      variable = await figma.variables.getVariableByIdAsync(id);
    } catch (err) {
      return { id, found: false, error: err instanceof Error ? err.message : String(err) };
    }
    if (!variable) return { id, found: false };
    const valuesByMode = {};
    for (const [modeId, raw] of Object.entries(variable.valuesByMode)) {
      valuesByMode[modeId] = readValue(raw, variable.resolvedType, localVariableIds, space);
    }
    const collection = await collectionOf(variable.variableCollectionId);
    return {
      id,
      found: true,
      ...keyOf(variable),
      name: variable.name,
      resolvedType: variable.resolvedType,
      scopes: [...variable.scopes],
      collectionId: variable.variableCollectionId,
      ...collection ? { collection } : {},
      valuesByMode
    };
  }
  async function readLibraryCollection(id) {
    try {
      const collection = await figma.variables.getVariableCollectionByIdAsync(id);
      if (!collection) return void 0;
      return {
        ...keyOf(collection),
        name: collection.name,
        modes: collection.modes.map((mode) => ({ id: mode.modeId, name: mode.name })),
        defaultModeId: collection.defaultModeId
      };
    } catch {
      return void 0;
    }
  }
  async function readFileKeys() {
    const lists = await Promise.all([
      figma.variables.getLocalVariableCollectionsAsync(),
      figma.getLocalPaintStylesAsync(),
      figma.getLocalTextStylesAsync(),
      figma.getLocalEffectStylesAsync()
    ]);
    const keys = /* @__PURE__ */ new Set();
    for (const list of lists) for (const item of list) if (keyOf(item).key !== void 0) keys.add(item.key);
    return [...keys].sort();
  }
  function extensionOf(collection) {
    if (collection.isExtension !== true) return {};
    const parent = collection.parentVariableCollectionId;
    return { isExtension: true, ...typeof parent === "string" ? { parentCollectionId: parent } : {} };
  }
  function keyOf(item) {
    return typeof item.key === "string" && item.key !== "" ? { key: item.key } : {};
  }
  function readVariable(variable, localVariableIds, space) {
    const valuesByMode = {};
    for (const [modeId, raw] of Object.entries(variable.valuesByMode)) {
      valuesByMode[modeId] = readValue(raw, variable.resolvedType, localVariableIds, space);
    }
    return {
      id: variable.id,
      name: variable.name,
      resolvedType: variable.resolvedType,
      scopes: [...variable.scopes],
      codeSyntax: { ...variable.codeSyntax },
      hiddenFromPublishing: variable.hiddenFromPublishing,
      fromLibrary: variable.remote,
      description: variable.description,
      valuesByMode
    };
  }
  function readValue(value, resolvedType, localVariableIds, space) {
    if (isAlias(value)) {
      return { kind: "alias", targetId: value.id, targetKnown: localVariableIds.has(value.id) };
    }
    if (isComposeColor(value)) {
      return readComposedColor(value, localVariableIds, space);
    }
    if (isComposedColorObject(value)) {
      return readComposedColorObject(value, localVariableIds, space);
    }
    switch (resolvedType) {
      case "COLOR": {
        const c = value;
        return { kind: "color", r: c.r, g: c.g, b: c.b, a: "a" in c ? c.a : 1, space };
      }
      case "FLOAT":
        return { kind: "float", value };
      case "STRING":
        return { kind: "string", value };
      case "BOOLEAN":
        return { kind: "boolean", value };
      case "TIMING":
        return { kind: "timing", ms: value * 1e3 };
      case "EASING":
        return { kind: "easing", motion: readEasing(value) };
    }
  }
  function readEasing(motion) {
    return {
      type: motion.type,
      ...motion.easingFunctionCubicBezier ? {
        cubicBezier: [
          motion.easingFunctionCubicBezier.x1,
          motion.easingFunctionCubicBezier.y1,
          motion.easingFunctionCubicBezier.x2,
          motion.easingFunctionCubicBezier.y2
        ]
      } : {},
      ...motion.easingFunctionSpring ? { spring: { bounce: motion.easingFunctionSpring.bounce } } : {}
    };
  }
  function readPaintStyle(style, space) {
    return {
      id: style.id,
      ...keyOf(style),
      name: style.name,
      description: style.description,
      // Figma renders later paints on top; reverse so IR paints[0] is the visually-top fill
      // (the contract the core relies on). Invisible paints are dropped — they don't render.
      paints: style.paints.filter((paint) => paint.visible !== false).slice().reverse().map((paint) => readPaint(paint, space))
    };
  }
  function readPaint(paint, space) {
    switch (paint.type) {
      case "SOLID": {
        const colorVarId = boundColorId(paint.boundVariables);
        return {
          kind: "solid",
          color: { r: paint.color.r, g: paint.color.g, b: paint.color.b, a: paint.opacity ?? 1, space },
          ...colorVarId ? { colorVarId } : {}
        };
      }
      case "GRADIENT_LINEAR":
      case "GRADIENT_RADIAL":
      case "GRADIENT_ANGULAR":
      case "GRADIENT_DIAMOND":
        return {
          kind: "gradient",
          gradientType: paint.type.slice("GRADIENT_".length),
          stops: paint.gradientStops.map((stop) => {
            const colorVarId = boundColorId(stop.boundVariables);
            return {
              position: stop.position,
              color: { r: stop.color.r, g: stop.color.g, b: stop.color.b, a: stop.color.a, space },
              ...colorVarId ? { colorVarId } : {}
            };
          }),
          transform: paint.gradientTransform.map((row) => [...row])
        };
      default:
        return { kind: "unsupported", paintType: paint.type, raw: paint };
    }
  }
  function readTextStyle(style, space) {
    const ls = style.letterSpacing;
    const lh = style.lineHeight;
    const raw = style.fontName;
    const font = raw && raw !== figma.mixed ? raw : null;
    return {
      id: style.id,
      ...keyOf(style),
      name: style.name,
      description: style.description,
      props: {
        // fontName carries the weight + slant in `style` (e.g. "SemiBold Italic"); the core,
        // not the adapter, extracts the numeric weight and decides italic handling.
        fontFamily: font ? font.family : "",
        fontStyle: font ? font.style : "",
        ...font ? {} : { fontUnresolved: true },
        fontSize: style.fontSize,
        letterSpacing: { value: ls.value, unit: ls.unit },
        lineHeight: lh.unit === "AUTO" ? { unit: "AUTO" } : { unit: lh.unit, value: lh.value },
        extras: {
          textCase: style.textCase,
          textDecoration: style.textDecoration,
          paragraphSpacing: style.paragraphSpacing,
          paragraphIndent: style.paragraphIndent,
          listSpacing: style.listSpacing,
          hangingPunctuation: style.hangingPunctuation,
          hangingList: style.hangingList,
          leadingTrim: style.leadingTrim,
          textWrapStyle: style.textWrapStyle,
          ...readDecorationDetails(style, space)
        },
        boundVariables: readBoundVariables(style.boundVariables)
      }
    };
  }
  function readDecorationDetails(style, space) {
    const { textDecorationStyle, textDecorationOffset, textDecorationThickness, textDecorationColor } = style;
    if (!textDecorationStyle || !textDecorationOffset || !textDecorationThickness || !textDecorationColor) return {};
    const paint = textDecorationColor.value;
    const colorVarId = paint === "AUTO" ? void 0 : boundColorId(paint.boundVariables);
    return {
      decoration: {
        style: textDecorationStyle,
        offset: { ...textDecorationOffset },
        thickness: { ...textDecorationThickness },
        color: paint === "AUTO" ? "AUTO" : { r: paint.color.r, g: paint.color.g, b: paint.color.b, a: paint.opacity ?? 1, space },
        ...colorVarId ? { colorVarId } : {},
        skipInk: style.textDecorationSkipInk ?? true
      }
    };
  }
  function readEffectStyle(style, space) {
    return {
      id: style.id,
      ...keyOf(style),
      name: style.name,
      description: style.description,
      // Visible effects only (invisible ones don't render), in Figma's order — a shadow stack
      // maps to the DTCG shadow array in the same order. No reverse (unlike paints, which pick
      // a single top fill); the core keeps or picks per the shadow composite.
      effects: style.effects.filter((e) => e.visible !== false).map((e) => readEffect(e, space))
    };
  }
  function readEffect(effect, space) {
    switch (effect.type) {
      case "DROP_SHADOW":
      case "INNER_SHADOW":
        return {
          kind: effect.type === "DROP_SHADOW" ? "drop-shadow" : "inner-shadow",
          color: { r: effect.color.r, g: effect.color.g, b: effect.color.b, a: effect.color.a, space },
          offset: { x: effect.offset.x, y: effect.offset.y },
          radius: effect.radius,
          spread: effect.spread ?? 0,
          // Figma omits spread when 0
          boundVariables: readBoundVariables(effect.boundVariables)
        };
      default:
        return { kind: "unsupported", effectType: effect.type, raw: effect };
    }
  }
  function boundColorId(bound) {
    return bound?.color?.id;
  }
  function readBoundVariables(bound) {
    const out = {};
    if (!bound) return out;
    for (const [field, alias] of Object.entries(bound)) {
      if (alias?.id) out[field] = alias.id;
    }
    return out;
  }
  function isAlias(value) {
    return typeof value === "object" && value !== null && value.type === "VARIABLE_ALIAS";
  }
  function isComposeColor(value) {
    const v = value;
    return typeof value === "object" && value !== null && v.type === "VARIABLE_EXPRESSION" && v.expressionFunction === "COMPOSE_COLOR" && Array.isArray(v.expressionArguments) && v.expressionArguments.length === 2;
  }
  function readComposedColor(expr, localVariableIds, space) {
    const [colorArg, opacityArg] = expr.expressionArguments;
    return {
      kind: "composed-color",
      colorArg: readComposedColorArg(colorArg, localVariableIds, space),
      opacityArg: readComposedOpacityArg(opacityArg, localVariableIds)
    };
  }
  function isComposedColorObject(value) {
    const v = value;
    return typeof value === "object" && value !== null && typeof v.color === "object" && v.color !== null && (typeof v.opacity === "number" || typeof v.opacity === "object" && v.opacity !== null);
  }
  function readComposedColorObject(value, localVariableIds, space) {
    return {
      kind: "composed-color",
      colorArg: readComposedColorArg(value.color, localVariableIds, space),
      opacityArg: readComposedOpacityArg(value.opacity, localVariableIds)
    };
  }
  function readComposedColorArg(arg, localVariableIds, space) {
    return isAlias(arg) ? { kind: "alias", targetId: arg.id, targetKnown: localVariableIds.has(arg.id) } : { kind: "color", color: readRgba(arg, space) };
  }
  function readComposedOpacityArg(arg, localVariableIds) {
    return isAlias(arg) ? { kind: "alias", targetId: arg.id, targetKnown: localVariableIds.has(arg.id) } : { kind: "literal", value: arg };
  }
  function readRgba(c, space) {
    return { r: c.r, g: c.g, b: c.b, a: "a" in c ? c.a : 1, space };
  }
  const SETUPS_KEY = "git-sync/setups";
  const LEGACY_SETTINGS_KEY = "git-sync/settings";
  const LEGACY_TOKEN_KEY = "git-sync/token";
  async function loadGitSync(fileKeys) {
    const setups = await readSetups();
    const index = matchSetup(setups, fileKeys);
    const own = index === -1 ? null : setups[index];
    if (own !== null && !sameKeys(own.keys, fileKeys)) {
      await writeSetups(setups.map((s, i) => i === index ? { ...s, keys: [...fileKeys] } : s));
    }
    return {
      settings: own?.settings ?? null,
      token: own?.token ?? null,
      savedTokens: savedTokenHosts(setups.filter((_, i) => i !== index)),
      fileHasKeys: fileKeys.length > 0
    };
  }
  async function saveGitSync(fileKeys, settings, token) {
    if (fileKeys.length === 0) throw new Error("This file has no variables or styles to sync yet.");
    const setups = await readSetups();
    const index = matchSetup(setups, fileKeys);
    const previous = index === -1 ? null : setups[index];
    const others = setups.filter((_, i) => i !== index);
    let next;
    if (token === void 0) {
      const moved = previous !== null && !sameHost(previous.settings, settings);
      next = moved ? null : previous?.token ?? null;
    } else if (token === null || typeof token === "string") {
      next = token === "" ? null : token;
    } else {
      next = reusableToken(others, settings);
      if (next === null) throw new Error(`No saved token for ${settings.host}.`);
    }
    const reused = typeof token === "object" && token !== null;
    const kept = reused ? others.filter((s) => !(s.keys.length === 0 && sameHost(s.settings, settings))) : others;
    await writeSetups([...kept, { keys: [...fileKeys], settings, token: next }]);
  }
  async function clearGitSync(fileKeys) {
    const setups = await readSetups();
    const index = matchSetup(setups, fileKeys);
    if (index !== -1) await writeSetups(setups.filter((_, i) => i !== index));
  }
  function matchSetup(setups, fileKeys) {
    const own = new Set(fileKeys);
    let best = -1;
    let bestOverlap = 0;
    setups.forEach((setup, i) => {
      const overlap = setup.keys.filter((key) => own.has(key)).length;
      if (overlap > bestOverlap) {
        best = i;
        bestOverlap = overlap;
      }
    });
    return best;
  }
  function reusableToken(setups, settings) {
    for (let i = setups.length - 1; i >= 0; i--) {
      const s = setups[i];
      if (s.token !== null && sameHost(s.settings, settings)) return s.token;
    }
    return null;
  }
  function savedTokenHosts(setups) {
    const seen = /* @__PURE__ */ new Map();
    for (const { settings, token } of setups) {
      if (token !== null) seen.set(`${settings.provider} ${settings.host}`, { provider: settings.provider, host: settings.host });
    }
    return [...seen.values()];
  }
  function sameHost(a, b) {
    return a.provider === b.provider && a.host === b.host;
  }
  function sameKeys(a, b) {
    return a.length === b.length && a.every((key, i) => key === b[i]);
  }
  async function readSetups() {
    const raw = await figma.clientStorage.getAsync(SETUPS_KEY);
    const setups = Array.isArray(raw) ? raw.filter(isSetup) : [];
    return upgradeLegacy(setups);
  }
  async function writeSetups(setups) {
    await figma.clientStorage.setAsync(SETUPS_KEY, setups);
  }
  async function upgradeLegacy(setups) {
    const [settings, token] = await Promise.all([
      figma.clientStorage.getAsync(LEGACY_SETTINGS_KEY),
      figma.clientStorage.getAsync(LEGACY_TOKEN_KEY)
    ]);
    if (settings === void 0 && token === void 0) return setups;
    const upgraded = isSettings(settings) && typeof token === "string" && token !== "" ? [...setups, { keys: [], settings, token }] : setups;
    if (upgraded !== setups) await writeSetups(upgraded);
    await figma.clientStorage.deleteAsync(LEGACY_SETTINGS_KEY);
    await figma.clientStorage.deleteAsync(LEGACY_TOKEN_KEY);
    return upgraded;
  }
  function isSetup(value) {
    if (typeof value !== "object" || value === null) return false;
    const v = value;
    return Array.isArray(v.keys) && v.keys.every((key) => typeof key === "string") && isSettings(v.settings) && (v.token === null || typeof v.token === "string" && v.token !== "");
  }
  function isSettings(value) {
    if (typeof value !== "object" || value === null) return false;
    const v = value;
    return (v.provider === "github" || v.provider === "gitlab") && typeof v.host === "string" && typeof v.repo === "string" && typeof v.baseBranch === "string" && typeof v.targetDir === "string";
  }
  function post(message) {
    figma.ui.postMessage(message);
  }
  async function postGitSync(error) {
    let fileKeys = [];
    try {
      fileKeys = await readFileKeys();
      const stored = await loadGitSync(fileKeys);
      post(error === void 0 ? { type: "settings/loaded", stored } : { type: "settings/loaded", stored, error });
    } catch (err) {
      post({
        type: "settings/loaded",
        stored: { settings: null, token: null, savedTokens: [], fileHasKeys: fileKeys.length > 0 },
        error: error ?? (err instanceof Error ? err.message : String(err))
      });
    }
  }
  figma.showUI(__html__, { width: 500, height: 720, themeColors: true });
  figma.ui.onmessage = async (message) => {
    try {
      switch (message.type) {
        case "ui/ready":
          post({ type: "sandbox/ready", fileName: figma.root.name });
          await postGitSync();
          return;
        case "settings/save": {
          let error;
          try {
            await saveGitSync(await readFileKeys(), message.settings, message.token);
          } catch (err) {
            error = err instanceof Error ? err.message : String(err);
          }
          await postGitSync(error);
          return;
        }
        case "settings/clear": {
          let error;
          try {
            await clearGitSync(await readFileKeys());
          } catch (err) {
            error = err instanceof Error ? err.message : String(err);
          }
          await postGitSync(error);
          return;
        }
        case "export/request": {
          post({ type: "export/ir", ir: await readDocument() });
          return;
        }
        case "ui/resize":
          figma.ui.resize(
            Math.max(320, Math.round(message.width)),
            Math.max(400, Math.round(message.height))
          );
          return;
        default:
          post({ type: "error", code: "unexpected", message: `Unknown message: ${JSON.stringify(message)}` });
      }
    } catch (err) {
      const code = message.type === "export/request" ? "read-failed" : "unexpected";
      post({ type: "error", code, message: err instanceof Error ? err.message : String(err) });
    }
  };
})();
