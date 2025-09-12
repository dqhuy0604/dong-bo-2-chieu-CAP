// Initialize single-node replica set for change streams
rs.initiate({
  _id: 'rs0',
  members: [
    { _id: 0, host: 'localhost:27017' }
  ]
});

// Wait for PRIMARY state
var check = function() {
  var status = rs.status();
  if (status.ok === 1 && status.members && status.members[0].stateStr === 'PRIMARY') {
    quit(0);
  }
  sleep(1000);
};

for (var i = 0; i < 60; i++) { check(); }

