const { TBMClient } = require("infotbm-client");

async function handleNextPassFromStop(agent) {
  const { Stop, Line, Transport } = agent.parameters;

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
        const [destinationNextPass] = currentNextPassValues;
        if (!destinationNextPass) {
          return nextPasses;
        }
        const infoDestination = destinationNextPass.reduce(
          (info, nextPassInfo) => {
            const { destinationName, waitTimeText } = nextPassInfo;
            if (info[destinationName]) {
              info[destinationName].push(waitTimeText);
            } else {
              info[destinationName] = [waitTimeText];
            }
            return info;
          },
          {}
        );
        nextPasses.push(infoDestination);
        return nextPasses;
      },
      []
    );
    if (nextPassesValues.length === 0) {
      agent.add(
        `Les prochains passages à l'arret ${Stop} ne sont pas disponibles.`
      );
    }
    nextPassesValues.forEach(nextPass => {
      const [[destinationName, destinationNextPasses]] = Object.entries(
        nextPass
      );
      const conjugationBeVerb =
        destinationNextPasses.length > 1 ? "sont" : "est";
      agent.add(
        `Les prochains passages à l'arret ${Stop} vers ${destinationName} ${conjugationBeVerb} dans ${destinationNextPasses.join(
          " et "
        )}`
      );
    });
  } catch (error) {
    console.error(error);
  }
}

module.exports = handleNextPassFromStop;
