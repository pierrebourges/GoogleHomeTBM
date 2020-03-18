const { TBMClient } = require("infotbm-client");
const { Payload } = require("dialogflow-fulfillment");

async function handleNextPassFromStop(agent) {
  const { Stop, Line, Transport } = agent.parameters;

  const formatTextToSpeech = text => {
    let stopToSpeech = `Les prochains passages à l'arret ${Stop}:\n\n`;
    const destinationTimes = text
      .map(nextPass =>
        nextPass
          .map(destinationText => {
            const [destinationTextEntries] = Object.entries(destinationText);
            const [
              destinationName,
              destinationNextPasses
            ] = destinationTextEntries;
            const conjugationBeVerb =
              destinationNextPasses.length > 1 ? "sont" : "est";
            return `Vers ${destinationName} ${conjugationBeVerb} dans ${destinationNextPasses.join(
              " et "
            )}.`;
          })
          .join("\n\n")
      )
      .join("\n\n");
    return stopToSpeech + destinationTimes;
  };

  const formatDisplayText = text => {
    const stop = `Arrêt: ${Stop}.\n`;
    const destinationPasses = text
      .map(nextPass =>
        nextPass
          .map(destinationText => {
            const [[destinationName, destinationNextPasses]] = Object.entries(
              destinationText
            );
            return `Destination ${destinationName}: ${destinationNextPasses.join(
              ", "
            )}.`;
          })
          .join("\n\n")
      )
      .join("\n\n");
    return stop + destinationPasses;
  };

  try {
    let transportString = "TBC";
    const lineDict = { "59": "A", "60": "B", "61": "C", "62": "D" };
    if (Object.keys(lineDict).includes(Line)) {
      transportString = "TBT";
    }

    const res = await TBMClient.getLine(`line:${transportString}:${Line}`);
    const { routes } = res;
    let codeNumber = Line;
    if (Object.keys(lineDict).includes(Line)) {
      codeNumber = lineDict[Line];
    }
    const stops = routes.reduce((stops, route) => {
      const stopPoints = route.stopPoints.filter(stopPoints => {
        const stopRegex = new RegExp(`.*${Stop}.*`, "i");
        return stopRegex.test(stopPoints.name);
      });
      stops.push(...stopPoints);
      return stops;
    }, []);
    const nextPassPromises = stops.map(async stop => {
      const characterIndex = stop.id.lastIndexOf(":");
      const id = stop.id.substring(characterIndex + 1);
      return await TBMClient.nextPass(id, codeNumber);
    });
    const nextPass = await Promise.all(nextPassPromises);
    const nextPassesValues = Object.values(nextPass).reduce(
      (nextPasses, currentNextPass) => {
        const currentNextPassValues = Object.values(currentNextPass);
        if (currentNextPassValues.length === 0) {
          return nextPasses;
        }
        const infoDestinations = currentNextPassValues.map(
          destinationNextPass =>
            destinationNextPass.reduce((info, nextPassInfo) => {
              const { destinationName, waitTimeText } = nextPassInfo;
              if (info[destinationName]) {
                info[destinationName].push(waitTimeText);
              } else {
                info[destinationName] = [waitTimeText];
              }
              return info;
            }, {})
        );
        nextPasses.push(infoDestinations);
        return nextPasses;
      },
      []
    );

    if (nextPassesValues.length === 0) {
      agent.add(
        `Les prochains passages à l'arret ${Stop} ne sont pas disponibles.`
      );
    }

    const payload = new Payload("ACTIONS_ON_GOOGLE", {
      expectUserResponse: false,
      isSsml: false,
      noInputPrompts: [],
      richResponse: {
        items: [
          {
            simpleResponse: {
              textToSpeech: formatTextToSpeech(nextPassesValues),
              displayText: formatDisplayText(nextPassesValues)
            }
          }
        ]
      }
    });

    agent.add(payload);
  } catch (error) {
    console.error(error);
  }
}

module.exports = handleNextPassFromStop;
