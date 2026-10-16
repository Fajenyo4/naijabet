// Nigerian bookmakers' official sites. On phones with the bookie's app installed,
// the OS opens the app instead of the browser when the bookie supports app links.
export const BOOKIES = [
  { name: "Bet9ja", url: "https://www.bet9ja.com/" },
  { name: "SportyBet", url: "https://www.sportybet.com/ng/" },
  { name: "BetKing", url: "https://www.betking.com/" },
  { name: "Betway", url: "https://www.betway.com.ng/" },
  { name: "MSport", url: "https://www.msport.com/ng/" },
] as const;

/** A market described in the terms Nigerian bookies use on their betslips. */
export function bookieMarket(key: string): string {
  switch (key) {
    case "1": return "1X2: Home (1)";
    case "X": return "1X2: Draw (X)";
    case "2": return "1X2: Away (2)";
    case "1X": return "Double Chance: 1X";
    case "X2": return "Double Chance: X2";
    case "12": return "Double Chance: 12";
    case "O1.5": return "Over/Under 1.5: Over";
    case "O2.5": return "Over/Under 2.5: Over";
    case "O3.5": return "Over/Under 3.5: Over";
    case "U2.5": return "Over/Under 2.5: Under";
    case "U3.5": return "Over/Under 3.5: Under";
    case "GG": return "GG/NG: GG";
    case "NG": return "GG/NG: NG";
    case "H0.5": return "Home Team Over/Under 0.5: Over";
    case "A0.5": return "Away Team Over/Under 0.5: Over";
    case "H1.5": return "Home Team Over/Under 1.5: Over";
    case "A1.5": return "Away Team Over/Under 1.5: Over";
    default: return key;
  }
}
