'use strict';

var express = require('express');
var braintree = require('braintree');
var router = express.Router(); 
var gateway = require('../lib/gateway');

var TRANSACTION_SUCCESS_STATUSES = [
  braintree.Transaction.Status.Authorizing,
  braintree.Transaction.Status.Authorized,
  braintree.Transaction.Status.Settled,
  braintree.Transaction.Status.Settling,
  braintree.Transaction.Status.SettlementConfirmed,
  braintree.Transaction.Status.SettlementPending,
  braintree.Transaction.Status.SubmittedForSettlement
];

function formatErrors(errors) {
  var formattedErrors = '';

  for (var i in errors) { 
    if (errors.hasOwnProperty(i)) {
      formattedErrors += 'Error: ' + errors[i].code + ': ' + errors[i].message + '\n';
    }
  }
  return formattedErrors;
}

function createResultObject(transaction) {
  var result;
  var status = transaction.status;

  if (TRANSACTION_SUCCESS_STATUSES.indexOf(status) !== -1) {
    result = {
      header: 'Sweet Success!',
      icon: 'success',
      message: 'Your test transaction has been successfully processed. See the Braintree API response and try again.'
    };
  } else {
    result = {
      header: 'Transaction Failed',
      icon: 'fail',
      message: 'Your test transaction has a status of ' + status + '. See the Braintree API response and try again.'
    };
  }

  return result;
}

router.get('/', function (req, res) {
  res.redirect('checkouts/new');
});

//New transaction form.  Generates token then renders NEW view
router.get('/checkouts/new', function (req, res) {

  gateway.clientToken.generate({}, function (err, response) {
    res.render('new', {clientToken: response.clientToken, messages: req.flash('error')});
  });
});

//Used to show the result of the succesful transactions
router.get('/checkouts/id/:id', function (req, res) {
  var result;
  var transactionId = req.params.id;

  gateway.transaction.find(transactionId, function (err, transaction) {
    result = createResultObject(transaction);
    res.render('show', {transaction: transaction, result: result});
  });
});

router.post('/checkouts', function (req, res) {
  var transactionErrors;
  var amount = req.body.amount; 
  var nonce = req.body.payment_method_nonce;

    //First we are going to create a customer, verify the credit card and save the payment method in the vault with the customer name/id
    gateway.customer.create({
      firstName:req.body.customer,
      paymentMethodNonce:nonce,
      creditCard: {
        options: {
          verifyCard: true
        }
      }
    }, function(err,result){
      if(result.success){
        //Next we are going to replace the paymentMethodNonce with the paymentMethodToken, since the original nonce has been spent.  We're assuming the first payment method for the customer is the one they want to use.
        nonce = result.customer.paymentMethods[0].token
        //Next we are going to create a transaction
        gateway.transaction.sale({
          amount: amount,
          paymentMethodToken: nonce,
          options: {
            submitForSettlement: true
          }
        }, function (err, result) {
          //if the transaction result is a success, redirect to the SHOW view
          if (result.success || result.transaction) {
            res.redirect('checkouts/id/' + result.transaction.id);
          } else {
            //if the transaction result wasn't a success, redirect to the NEW view with the transaction error
            transactionErrors = result.errors.deepErrors();
            console.log('error', result.errors)
            req.flash('error', formatErrors(transactionErrors));
            res.redirect('checkouts/new');
          }
        });
      }
      else{
        //If we can't verify the card, redirect to the NEW view with the verification error
        console.log(result)
        req.flash('error', result.verification.processorResponseText);
        res.redirect('checkouts/new')
      }
    })

  });

module.exports = router;
