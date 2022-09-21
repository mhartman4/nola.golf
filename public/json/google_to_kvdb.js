const request = require("request")
const KVdb = require('kvdb.io');

// Schedule
request("https://docs.google.com/spreadsheets/d/1YsZn_ovmbxOE8gUlmAT7z_nUv5mg9qRdwnNAX-lIrnI/gviz/tq?tqx=out:json&tq&gid=61191989", function(error, response, body) {
  const bucket = KVdb.bucket("vRrcDLPTr4WWpVTJxim1H");
  bucket.set('schedule', body);
});

// Rosters
request("`https://docs.google.com/spreadsheets/d/1YsZn_ovmbxOE8gUlmAT7z_nUv5mg9qRdwnNAX-lIrnI/gviz/tq?tqx=out:json&tq&gid=629583302`", function(error, response, body) {
  const bucket = KVdb.bucket("vRrcDLPTr4WWpVTJxim1H");
  bucket.set('rosters', body);
});
 
// Overall
request(`https://docs.google.com/spreadsheets/d/1YsZn_ovmbxOE8gUlmAT7z_nUv5mg9qRdwnNAX-lIrnI/gviz/tq?tqx=out:json&tq&gid=1520535624`, function(error, response, body) {
  const bucket = KVdb.bucket("vRrcDLPTr4WWpVTJxim1H");
  bucket.set('overall', body);
});

// Golfer Earningfs
request(`https://docs.google.com/spreadsheets/d/1YsZn_ovmbxOE8gUlmAT7z_nUv5mg9qRdwnNAX-lIrnI/gviz/tq?tqx=out:json&tq&gid=1425386487`, function(error, response, body) {
  const bucket = KVdb.bucket("vRrcDLPTr4WWpVTJxim1H");
  bucket.set('golfer-earnings', body);
});


// // DV Rosters
// request("https://spreadsheets.google.com/feeds/list/1DHwz1zRTstqmD1Ej8ypqgzkx8D46Uu_RjAqhS1zenR0/1/public/full?alt=json", function(error, response, body) {
//   const bucket = KVdb.bucket("vRrcDLPTr4WWpVTJxim1H");
//   bucket.set('dv_rosters', body);
// });

// // DV Overall Standings
// request("https://spreadsheets.google.com/feeds/list/1DHwz1zRTstqmD1Ej8ypqgzkx8D46Uu_RjAqhS1zenR0/2/public/full?alt=json", function(error, response, body) {
//   const bucket = KVdb.bucket("vRrcDLPTr4WWpVTJxim1H");
//   bucket.set('dv_overall', body);
// });