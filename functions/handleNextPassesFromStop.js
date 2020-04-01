const { TBMClient } = require("infotbm-client");
const { Payload } = require("dialogflow-fulfillment");

const lineDict = { "59": "A", "60": "B", "61": "C", "62": "D" };

const formatTextToSpeech = (text, stop) => {
  let stopToSpeech = `Les prochains passages à l'arret ${stop}:\n\n`;
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
          return `Vers ${destinationName.toLowerCase()} ${conjugationBeVerb} dans ${destinationNextPasses.join(
            " et "
          )}.`;
        })
        .join("\n\n")
    )
    .join("\n\n");
  return stopToSpeech + destinationTimes;
};

const formatDisplayText = (text, stop) => {
  const stopString = `Arrêt: ${stop}.\n`;
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
  return stopString + destinationPasses;
};

const getTransportStringForLine = line => {
  let transportString = "TBC";
  if (Object.keys(lineDict).includes(line)) {
    transportString = "TBT";
  }
  return transportString;
};

const getCodeNumberForLine = line => {
  let codeNumber = line;
  if (Object.keys(lineDict).includes(line)) {
    codeNumber = lineDict[line];
  }
  return codeNumber;
};

const getStopsFromRoutes = (routes, stop) => {
  const filterStop = stopPoints => {
    const stopRegex = new RegExp(`.*${stop}.*`, "i");
    return stopRegex.test(stopPoints.name);
  };

  return routes.reduce((stops, route) => {
    const stopPoints = route.stopPoints.filter(filterStop);
    return stops.concat(stopPoints);
  }, []);
};

const getNextPassagesFromStops = async (line, stops) => {
  const codeNumber = getCodeNumberForLine(line);

  const nextPassPromises = stops.map(async stop => {
    const characterIndex = stop.id.lastIndexOf(":");
    const id = stop.id.substring(characterIndex + 1);
    return await TBMClient.nextPass(id, codeNumber);
  });
  const nextPass = await Promise.all(nextPassPromises);
  return Object.values(nextPass).reduce((nextPassages, currentNextPass) => {
    const currentNextPassValues = Object.values(currentNextPass);
    if (currentNextPassValues.length === 0) {
      return nextPassages;
    }
    const infoDestinations = currentNextPassValues.map(destinationNextPass =>
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
    nextPassages.push(infoDestinations);
    return nextPassages;
  }, []);
};

async function handleNextPassFromStop(agent) {
  const { Stop, Line } = agent.parameters;

  try {
    const transportString = getTransportStringForLine(Line);

    const lineStops = await TBMClient.getLine(
      `line:${transportString}:${Line}`
    );
    const { routes } = lineStops;
    const stops = getStopsFromRoutes(routes, Stop);

    if (stops.length === 0) {
      return agent.end(`Il n'y a pas d'arret ${Stop} sur la ligne ${Line}.`);
    }

    const nextPassages = await getNextPassagesFromStops(Line, stops);

    if (nextPassages.length === 0) {
      return agent.end(
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
              textToSpeech: formatTextToSpeech(nextPassages, Stop),
              displayText: formatDisplayText(nextPassages, Stop)
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
