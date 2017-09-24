// The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const functions = require('firebase-functions');
const moment = require('moment');

// The Firebase Admin SDK to access the Firebase Realtime Database. 
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);

// Take the text parameter passed to this HTTP endpoint and insert it into the
// Realtime Database under the path /messages/:pushId/original
exports.addMessage = functions.https.onRequest((req, res) => {
  // Grab the text parameter.
  const original = req.query.text;
  // Push the new message into the Realtime Database using the Firebase Admin SDK.
  admin.database().ref('/messages').push({original: original}).then(snapshot => {
    // Redirect with 303 SEE OTHER to the URL of the pushed object in the Firebase console.
    res.redirect(303, snapshot.ref);
  });
});


// Listens for new messages added to /messages/:pushId/original and creates an
// uppercase version of the message to /messages/:pushId/uppercase
exports.makeUppercase = functions.database.ref('/messages/{pushId}/original')
    .onWrite(event => {
      // Grab the current value of what was written to the Realtime Database.
      const original = event.data.val();
      console.log('Uppercasing', event.params.pushId, original);
      const uppercase = original.toUpperCase();
      // You must return a Promise when performing asynchronous tasks inside a Functions such as
      // writing to the Firebase Realtime Database.
      // Setting an 'uppercase' sibling in the Realtime Database returns a Promise.
      return event.data.ref.parent.child('uppercase').set(uppercase);
    });

exports.triggerUpdateUserDuration = functions.database.ref('/users/{userId}/profile/duration')
    .onUpdate(event => {
      var deferred = Promise.defer();
      event.data.ref.parent.once('value', function(data) {
        console.log('Updating user expiration', event.params.userId, data.val());
        var d = moment(data.startDate);
        d.add(+data.duration, 'months');
        data.expiredAt = d.toISOString()
        data.active = moment() <= d;
        var updateObj = {
          'profile/expiredAt': data.expiredAt,
          'account/active': data.active
        }
        event.data.ref.parent.parent.update(data).then(function() {
          deferred.resolve();
          console.log('Finished update', updateObj, event.data.ref.parent.parent.key);
        })
      })
      return deferred.promise;
    });

exports.dailyUserExpirationCheck = functions.https.onRequest((req, res) => {
  var usersRef = admin.database().ref('/users').orderByChild('account/active').equalTo(true);
  usersRef.once('value', function(data) {
    var users = data.val();
    var updateObj = {};
    Object.keys(users).map(function(id) {
      var d = moment(data.startDate);
      d.add(+data.duration, 'months');
      data.expiredAt = d.toISOString()
      if(!users[id].profile.expiredAt) {
        var d = moment(users[id].profile.startDate);
        d.add(+users[id].profile.duration, 'months');
        users[id].profile.expiredAt = d.toISOString()
      }
      var d = moment(users[id].profile.expiredAt);
      updateObj[id + '/account/active'] = moment() <= d;
      updateObj[id + '/profile/expiredAt'] = d.toISOString();
    });
    admin.database().ref('/users').update(updateObj).then(function() {
      res.json(updateObj);
    })
  })
});
