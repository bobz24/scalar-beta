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
      name: collection.name,
      modes: collection.modes.map((mode) => ({ id: mode.modeId, name: mode.name })),
      defaultModeId: collection.defaultModeId,
      variables: (variablesByCollection.get(collection.id) ?? []).map(
        (v) => readVariable(v, localVariableIds, space)
      )
    }));
    return {
      collections: irCollections,
      paintStyles: paintStyles.map((s) => readPaintStyle(s, space)),
      textStyles: textStyles.map(readTextStyle),
      effectStyles: effectStyles.map((s) => readEffectStyle(s, space))
    };
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
  function readTextStyle(style) {
    const ls = style.letterSpacing;
    const lh = style.lineHeight;
    const raw = style.fontName;
    const font = raw && raw !== figma.mixed ? raw : null;
    return {
      id: style.id,
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
          textWrapStyle: style.textWrapStyle
        },
        boundVariables: readBoundVariables(style.boundVariables)
      }
    };
  }
  function readEffectStyle(style, space) {
    return {
      id: style.id,
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
  function post(message) {
    figma.ui.postMessage(message);
  }
  figma.showUI(__html__, { width: 500, height: 720, themeColors: true });
  figma.ui.onmessage = async (message) => {
    try {
      switch (message.type) {
        case "ui/ready":
          post({ type: "sandbox/ready", fileName: figma.root.name });
          return;
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
