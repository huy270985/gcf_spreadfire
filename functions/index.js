// The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const functions = require('firebase-functions');
const moment = require('moment');

// The Firebase Admin SDK to access the Firebase Realtime Database. 
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);

function getUpdateObj(profile) {
    var d = moment(profile.startDate);
    d.add(+profile.duration, 'months');
    var expiredAt = d.toISOString()
    var active = moment() <= d;
    return {
      'account/expiredAt': expiredAt,
      'account/active': active
   }
}

exports.triggerUpdateAccountOnProfileChanged = functions.database.ref('/users/{userId}/profile')
    .onUpdate(event => {
      var profile = event.data.val();
      console.log('Updating user expiration', event.params.userId, profile);
      var updateObj = getUpdateObj(profile);
      console.log('Updating on node', event.data.ref.parent.key);
      return event.data.ref.parent.update(updateObj);
  });


exports.httpDailyUserExpirationCheck = functions.https.onRequest((req, res) => {
  var usersRef = admin.database().ref('/users').orderByChild('account/active').equalTo(true);
  usersRef.once('value', function(data) {
    var users = data.val();
    var updateObj = {};
    Object.keys(users).map(function(id) {
      var profile = users[id].profile;
      var account = users[id].account;
      var userUpdateObj = getUpdateObj(profile);
      console.log('Calculating update data for user:', users[id]);
      console.log('Finished with updateObj', userUpdateObj);
      updateObj[id + '/account/active'] = userUpdateObj['account/active'];
      updateObj[id + '/account/expiredAt'] = userUpdateObj['account/expiredAt'];
    });
    admin.database().ref('/users').update(updateObj).then(function() {
      res.json(updateObj);
    })
  })
});
