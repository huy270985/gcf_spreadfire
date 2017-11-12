// The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const functions = require('firebase-functions');
const moment = require('moment');

// The Firebase Admin SDK to access the Firebase Realtime Database.
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);

function getUpdateObj(profile) {
    var d = profile.startDate ? moment(profile.startDate) : moment();
    var duration = +profile.duration ? +profile.duration : 0;
    d.add(duration, 'months');
    var expiredAt = d.toISOString()
    var active = moment() <= d;
    return {
      'account/expiredAt': expiredAt,
      'account/active': active
   }
}

exports.triggerSetupProfileOnUserCreation = functions.auth.user()
    .onCreate(event => {
      const user = event.data;
      var uid = event.data.uid;
      console.log('triggerSetupProfileOnUserCreation for user', uid);
      return admin.database().ref('/users/' + uid).update({
        'profile/startDate': moment().toISOString(),
        'profile/duration': 0,
        'profile/email': user.email,
      });
    });

exports.triggerUpdateAccountOnProfileChanged = functions.database.ref('/users/{userId}/profile')
    .onUpdate(event => {
      var profile = event.data.val();
      console.log('Updating user expiration', event.params.userId, profile);
      var updateObj = getUpdateObj(profile);
      console.log('Updating on node', event.data.ref.parent.key, updateObj);
      return event.data.ref.parent.update(updateObj);
  });


exports.httpDailyUserExpirationCheck = functions.https.onRequest((req, res) => {
  var usersRef = admin.database().ref('/users').orderByChild('account/active').equalTo(true);
  usersRef.once('value', function(data) {
    var users = data.val();
    var updateObj = {};
    Object.keys(users).map(function(id) {
      try{
        var profile = users[id].profile;
        var account = users[id].account;
        var userUpdateObj = getUpdateObj(profile);
        if(userUpdateObj['account/active'] !== account.active) {
          updateObj[id + '/account/active'] = userUpdateObj['account/active'];
        }
        if(userUpdateObj['account/expiredAt'] !== account.expiredAt) {
          updateObj[id + '/account/expiredAt'] = userUpdateObj['account/expiredAt'];
        }
      }
      catch(e) {
        console.error('Error while checking user expiration', users[id], e);
      }
    });
    admin.database().ref('/users').update(updateObj).then(function() {
      console.log('Following user accounts will be updated', updateObj);
      res.json({
        status: 'OK',
        message: 'Changes to user account is in "data", if empty mean no update',
        data: updateObj
      });
    })
  })
});
