// Public, authored synthetic text only. Never add private subtitles or transcripts.
const srt = (texts, step = 5000) => texts.map((text, i) => {
  const stamp = ms => `00:00:${String(Math.floor(ms / 1000)).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
  return `${i + 1}\n${stamp(i * step)} --> ${stamp((i + 1) * step)}\n${text}\n`;
}).join('\n');
const ass = text => `[Script Info]\nTitle: Synthetic fixture\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nComment: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,Preserve this comment\nDialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,${text}\n`;
export const fixtures = [
  {id:'english-phrase', language:'en', format:'srt', source:srt(['We should meet outside the old station after the last train.']),
    literal:{sameLine:['outside the old station','after the last train']},
    requirements:{meaning:'The proposed meeting is outside the old station and takes place after the last train.'}},
  {id:'spanish-phrase', language:'es', format:'srt', source:srt(['Nos vemos en la estación central después del último tren.']),
    literal:{sameLine:['en la estación central','después del último tren']},
    requirements:{meaning:'El encuentro es en la estación central y ocurre después del último tren.'}},
  {id:'translated-english', language:'en', audioLanguage:'es', translated:true, format:'srt', source:srt(['If María cannot come, we should wait outside the station.']),
    requirements:{condition:'The English caption says to wait outside the station only if María cannot come.'}},
  {id:'translated-spanish-ass', language:'es', audioLanguage:'en', translated:true, format:'ass', source:ass('Si María no puede venir, debemos esperar fuera de la estación.'),
    requirements:{condition:'El subtítulo dice que debemos esperar fuera de la estación si María no puede venir.'}},
  {id:'names-numbers-negation', language:'en', format:'srt', source:srt(['Do not give Dr. Ana Ruiz more than 1.5 mg at 8:30.']),
    literal:{sameLine:['Dr. Ana Ruiz','1.5 mg']},
    requirements:{dose:'The caption forbids giving Dr. Ana Ruiz more than 1.5 mg at 8:30.'}},
  {id:'english-punctuation', language:'en', punctuation:true, format:'srt', source:srt(['we should wait here until maría arrives']),
    requirements:{surface:'The caption uses sentence capitalization, capitalizes María as a name, and ends with appropriate punctuation.', condition:'We should wait here until María arrives; the arrival is not stated to have already happened.'}},
  {id:'spanish-punctuation', language:'es', punctuation:true, format:'ass', source:ass('si no viene ana nos quedamos aquí'),
    requirements:{surface:'El subtítulo tiene mayúscula inicial, escribe Ana con mayúscula y tiene puntuación de cierre.', condition:'Nos quedamos aquí si Ana no viene; la negación pertenece a venir.'}},
  {id:'ass-karaoke', language:'es', format:'ass', source:ass('{\\k40}No {\\k50}te {\\k80}vayas.\\N{\\i1}Por favor.'), protected:true,
    requirements:{meaning:'The caption asks the addressee not to leave and says please.'}},
  {id:'two-speakers', language:'en', format:'srt', source:srt(['- Can you stay?\n- No, I cannot.']), protected:true,
    requirements:{speakers:'A question and a negative reply are displayed as two distinct speaker turns.'}},
  {id:'lyrics', language:'es', format:'srt', source:srt(['♪ No, no, no, no te vayas.']), protected:true,
    requirements:{repetition:'The song retains all four occurrences of no as intentional repetition.'}},
  {id:'continuous-duplicate', language:'en', format:'srt', source:srt(['We should meet outside the old station after the last train.','We should meet outside the old station after the last train.'],4000), expectedCues:1,
    requirements:{meaning:'The caption proposes meeting outside the old station after the last train.'}},
  {id:'fast-caption', language:'en', format:'srt', source:srt(['1234567890\n12345678901'],1050), expectedWarning:'Reading speed',
    requirements:{numbers:'Both complete digit sequences 1234567890 and 12345678901 remain present.'}},
  {id:'unsupported-language', language:'ar', format:'srt', source:srt(['هذا نص مترجم.']), protected:true,
    requirements:{language:'The caption stays in Arabic and retains the original Arabic wording.'}},
  {id:'english-continuation', language:'en', punctuation:true, format:'srt', source:srt(['if ana comes','we can leave together']),
    literal:{continuations:[0]},
    requirements:{condition:'Across the two captions, leaving together remains conditional on Ana coming.'}},
  {id:'spanish-continuation', language:'es', punctuation:true, format:'srt', source:srt(['si no viene ana','nos quedamos aquí']),
    literal:{continuations:[0]},
    requirements:{condition:'Nos quedamos aquí solo si Ana no viene.'}},
  {id:'english-question', language:'en', punctuation:true, format:'srt', source:srt(['You can wait, can you not?']),
    literal:{endings:[{cue:0,mark:'?'}]},
    requirements:{question:'The caption asks whether the addressee can wait.'}},
  {id:'spanish-question', language:'es', punctuation:true, format:'srt', source:srt(['¿No viene Ana?']),
    literal:{endings:[{cue:0,mark:'?'}],beginnings:[{cue:0,mark:'¿'}]},
    requirements:{question:'La llegada de Ana se pregunta, no se afirma.'}},
  {id:'english-uncertainty', language:'en', punctuation:true, format:'srt', source:srt(['we may not arrive before ana']),
    requirements:{uncertainty:'Arriving before Ana is uncertain; the caption does not claim a definite arrival or give a separate negative reply.'}},
  {id:'spanish-negation', language:'es', punctuation:true, format:'srt', source:srt(['no quiero salir todavía']),
    literal:{capitalized:[0],endings:[{cue:0,mark:'.'}]},
    requirements:{negation:'La persona no quiere salir todavía; no dice que sí quiere salir después de una respuesta No.'}},
  // Fresh native validation, authored before observing the recovery implementation's output.
  {id:'english-departure', language:'en', punctuation:true, format:'srt', source:srt(['we do not need to leave yet']),
    literal:{capitalized:[0],endings:[{cue:0,mark:'.'}]},
    requirements:{negation:'There is no need to leave yet; the caption does not say that departure is necessary.'}},
  {id:'spanish-date', language:'es', punctuation:true, format:'srt', source:srt(['no debemos cambiar la fecha todavía']),
    literal:{capitalized:[0],endings:[{cue:0,mark:'.'}]},
    requirements:{negation:'Todavía no debemos cambiar la fecha; no se indica que debamos cambiarla.'}},
  {id:'english-delivery', language:'en', punctuation:true, format:'srt', source:srt(['rosa will bring 24 kg tomorrow']),
    literal:{sameLine:['Rosa','24 kg'],endings:[{cue:0,mark:'.'}]},
    requirements:{delivery:'Rosa will bring 24 kg tomorrow, rather than having already brought it.'}},
  {id:'spanish-wait', language:'es', punctuation:true, format:'srt', source:srt(['no podemos esperar más']),
    literal:{capitalized:[0],endings:[{cue:0,mark:'.'}]},
    requirements:{negation:'La persona dice que no pueden esperar más.'}}
];

// Labels are engineering judgments, not independent native-speaker ratings.
// Fit and validation examples stay separate. Do not tune questions after seeing validation.
const pair = (id, split, reference, requirement, good, bad) => [
  {id:`${id}-good`, split, reference, candidate:good, requirements:{check:requirement}, expected:'pass'},
  {id:`${id}-bad`, split, reference, candidate:bad, requirements:{check:requirement}, expected:'fail'}
];
export const calibration = [
  ...pair('en-name','calibration','We should ask Ana Ruiz before leaving.','The personal name Ana Ruiz is not split across display lines.','We should ask Ana Ruiz\nbefore leaving.','We should ask Ana\nRuiz before leaving.'),
  ...pair('es-article','calibration','Esperamos delante de la estación.','La expresión la estación no se separa entre dos líneas.','Esperamos delante\nde la estación.','Esperamos delante de la\nestación.'),
  ...pair('en-condition','calibration','If Ana cannot come, we should wait.','Waiting is conditional on Ana being unable to come.','If Ana cannot come,\nwe should wait.','Ana cannot come.\nWe should wait.'),
  ...pair('es-negation','calibration','No debes abrir esa puerta.','El subtítulo prohíbe abrir la puerta.','No debes abrir esa puerta.','Debes abrir esa puerta.'),
  ...pair('en-capitalization','calibration','we will wait for ana','The caption has sentence capitalization, the proper name Ana capitalized, and a final period.','We will wait for Ana.','we will wait for ana'),
  ...pair('es-capitalization','calibration','nos quedamos aquí','El subtítulo tiene mayúscula inicial y punto final.','Nos quedamos aquí.','nos quedamos aquí'),
  // The initial validation was inspected after a failed representation test.
  // It is now regression evidence, not an untouched validation set.
  ...pair('en-quantity','regression','Do not use more than 1.5 mg.','The caption forbids using more than 1.5 mg.','Do not use more\nthan 1.5 mg.','Do not use more\nthan 15 mg.'),
  ...pair('es-condition','regression','Si no llega Luis, nos vamos.','Nos vamos solo si Luis no llega.','Si no llega Luis,\nnos vamos.','Luis no llega.\nNos vamos.'),
  ...pair('en-speakers','regression','- Can you stay?\n- No, I cannot.','The question and answer have separate speaker lines.','- Can you stay?\n- No, I cannot.','- Can you stay? No, I cannot.'),
  ...pair('es-unit','regression','Añade 15 kg antes de salir.','El número 15 y su unidad kg están en la misma línea.','Añade 15 kg\nantes de salir.','Añade 15\nkg antes de salir.'),
  ...pair('es-name','regression','Debemos hablar con Marta Pérez antes del viaje.','El nombre Marta Pérez se muestra en una sola línea.','Debemos hablar con Marta Pérez\nantes del viaje.','Debemos hablar con Marta\nPérez antes del viaje.'),
  ...pair('en-unit','regression','Bring 24 kg before noon.','The number 24 and its unit kg appear on the same display line.','Bring 24 kg\nbefore noon.','Bring 24\nkg before noon.'),
  ...pair('en-uncertainty','regression','The train may arrive late.','The train arriving late is a possibility, not a certainty.','The train may arrive late.','The train will arrive late.'),
  ...pair('es-surface','regression','mañana viene pablo','La frase empieza con mayúscula, escribe Pablo con mayúscula y termina en punto.','Mañana viene Pablo.','mañana viene pablo'),
  ...pair('en-continuation','regression','If Luis arrives, we can leave.','The first caption does not end with a period; the conditional sentence continues in the second caption.','If Luis arrives,\n\nwe can leave.','If Luis arrives.\n\nWe can leave.'),
  ...pair('es-continuation','regression','Si no viene Marta, esperamos.','El primer subtítulo no termina en punto; la oración condicional continúa en el segundo.','Si no viene Marta,\n\nesperamos.','Si no viene Marta.\n\nEsperamos.'),
  ...pair('en-question','regression','Will you wait?','The caption remains a question, including its final question mark.','Will you wait?','Will you wait.'),
  ...pair('es-punctuation-negation','regression','No quiero ir.','La persona no quiere ir; no dice que sí quiere ir después de una respuesta No.','No quiero ir.','No, quiero ir.'),
  ...pair('en-location-time','validation','Meet behind the theatre before sunset.','The meeting is behind the theatre and before sunset.','Meet behind the theatre\nbefore sunset.','Meet inside the theatre\nafter sunset.'),
  ...pair('es-location-time','validation','Esperamos cerca del puente después de comer.','La espera ocurre cerca del puente y después de comer.','Esperamos cerca del puente\ndespués de comer.','Esperamos lejos del puente\nantes de comer.'),
  ...pair('en-conditional-departure','validation','If Rosa calls, we can depart.','Departure depends on Rosa calling.','If Rosa calls,\n\nwe can depart.','Rosa calls.\n\nWe can depart.'),
  ...pair('es-question-meaning','validation','¿Puede quedarse Diego?','Se pregunta si Diego puede quedarse.','¿Puede quedarse Diego?','Diego puede quedarse.')
];
