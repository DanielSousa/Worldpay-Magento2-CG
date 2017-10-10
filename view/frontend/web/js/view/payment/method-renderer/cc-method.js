/*browser:true*/
/*global define*/
define(
    [
        'Magento_Payment/js/view/payment/cc-form',
        'jquery',
        'Magento_Checkout/js/model/quote',
        'Magento_Customer/js/model/customer',
        'Magento_Payment/js/model/credit-card-validation/validator',
        'mage/url',
        'Magento_Checkout/js/action/place-order',
        'Magento_Checkout/js/action/redirect-on-success',
        'ko',
        'Magento_Checkout/js/action/set-payment-information',
        'worldpay'
    ],
    function (Component, $, quote, customer,validator, url, placeOrderAction, redirectOnSuccessAction,ko, setPaymentInformationAction,wp) {
        'use strict';

        //Valid card number or not.
        $.validator.addMethod('worldpay-validate-number', function (value) {
            if (value) {
                return evaluateRegex(value, "^[0-9]{12,20}$");
            }
        }, $.mage.__('Card number should contain between 12 and 20 numeric characters.'));

        //Valid Card or not.
        $.validator.addMethod('worldpay-cardnumber-valid', function (value) {
            return doLuhnCheck(value);
        }, $.mage.__('The card number entered is invalid.'));

        //Regex for valid card number.
        function evaluateRegex(data, re) {
            var patt = new RegExp(re);
            return patt.test(data);
        }

        function doLuhnCheck(value) {
            var nCheck = 0;
            var nDigit = 0;
            var bEven = false;
            value = value.replace(/\D/g, "");

            for (var n = value.length - 1; n >= 0; n--) {
                var cDigit = value.charAt(n);
                nDigit = parseInt(cDigit, 10);

                if (bEven) {
                    if ((nDigit *= 2) > 9) {
                        nDigit -= 9;
                    }
                }

                nCheck += nDigit;
                bEven = !bEven;
            }

            return (nCheck % 10) === 0;
        }
        return Component.extend({
            defaults: {
                intigrationmode: window.checkoutConfig.payment.ccform.intigrationmode,
                redirectAfterPlaceOrder: (window.checkoutConfig.payment.ccform.intigrationmode == 'direct') ? true : false,
                direcTemplate: 'Sapient_Worldpay/payment/direct-cc',
                redirectTemplate: 'Sapient_Worldpay/payment/redirect-cc',
                cardHolderName:'',
                SavedcreditCardVerificationNumber:'',
                saveMyCard:false,
                cseData:null
            },
            availableCCTypes : function(){
                var ccTypesArr = _.map(this.getCcAvailableTypes(), function (value, key) {
                                       return {
                                        'ccValue': key,
                                        'ccLabel': value
                                    };
                                });
                return ko.observableArray(ccTypesArr);
            },
            selectedCCType : ko.observable(),
            paymentToken:ko.observable(),

            getCode: function() {
                return 'worldpay_cc';
            },

            loadEventAction: function(data, event){
                if ((data.value)) {
                    if (data.value=="savedcard") {
                        $("#saved-Card-Visibility-Enabled").show();
                        $("#cc-Visibility-Enabled").children().prop('disabled',true);
                        $("#saved-Card-Visibility-Enabled").children().prop('disabled',false);
                        $("#cc-Visibility-Enabled").hide();
                        $("#worldpay_cc_save-card_div").hide();
                    }else{
                        $("#worldpay_cc_save-card_div").show();
                        $("#cc-Visibility-Enabled").children().prop('disabled',false);
                        $("#saved-Card-Visibility-Enabled").children().prop('disabled',true);
                        $("#saved-Card-Visibility-Enabled").hide();
                        $("#cc-Visibility-Enabled").show();
                    }
                } else {
                    if (data.selectedCCType() =="savedcard") {
                        $("#saved-Card-Visibility-Enabled").show();
                        $("#cc-Visibility-Enabled").children().prop('disabled',true);
                        $("#saved-Card-Visibility-Enabled").children().prop('disabled',false);
                        $("#cc-Visibility-Enabled").hide();
                        $("#worldpay_cc_save-card_div").hide();
                    }else{
                        $("#worldpay_cc_save-card_div").show();
                        $("#cc-Visibility-Enabled").children().prop('disabled',false);
                        $("#saved-Card-Visibility-Enabled").children().prop('disabled',true);
                        $("#saved-Card-Visibility-Enabled").hide();
                        $("#cc-Visibility-Enabled").show();
                    }
                }
            },
            getTemplate: function(){
                if (this.intigrationmode == 'direct') {
                    return this.direcTemplate;
                } else{
                    return this.redirectTemplate;
                }
            },
            threeDSEnabled: function(){
                return window.checkoutConfig.payment.ccform.is3DSecureEnabled;
            },

            getSavedCardsList:function(){
                return window.checkoutConfig.payment.ccform.savedCardList;
            },

            getTitle: function() {
               return window.checkoutConfig.payment.ccform.cctitle ;
            },
            hasVerification:function() {
               return window.checkoutConfig.payment.ccform.isCvcRequired ;
            },
            getSaveCardAllowed: function(){
                if(customer.isLoggedIn()){
                    return window.checkoutConfig.payment.ccform.saveCardAllowed;
                }
            },
            isActive: function() {
                return true;
            },
            paymentMethodSelection: function() {
                return window.checkoutConfig.payment.ccform.paymentMethodSelection;
            },
            getselectedCCType : function(inputName){
                if(this.paymentMethodSelection()=='radio'){
                     return $("input[name='"+inputName+"']:checked").val();
                    } else{
                      return  this.selectedCCType();
                }
            },

            /**
             * @override
             */
            getData: function () {
                return {
                    'method': "worldpay_cc",
                    'additional_data': {
                        'cc_cid': this.creditCardVerificationNumber(),
                        'cc_type': this.getselectedCCType('payment[cc_type]'),
                        'cc_exp_year': this.creditCardExpYear(),
                        'cc_exp_month': this.creditCardExpMonth(),
                        'cc_number': this.creditCardNumber(),
                        'cc_name': $('#' + this.getCode() + '_cc_name').val(),
                        'save_my_card': this.saveMyCard,
                        'cse_enabled': this.isClientSideEncryptionEnabled(),
                        'encryptedData': this.cseData,
                        'tokenCode': this.paymentToken,
                        'saved_cc_cid': $('.saved-cvv-number').val(),
                        'isSavedCardPayment': this.isSavedCardPayment
                    }
                };
            },
            isClientSideEncryptionEnabled:function(){
                if (this.getCsePublicKey()) {
                    return window.checkoutConfig.payment.ccform.cseEnabled;
                }
                return false;
            },
             getCsePublicKey:function(){
                return window.checkoutConfig.payment.ccform.csePublicKey;
            },
            getRegexCode:function(cardType){
                if ('AMEX' == cardType) {
                    return /^[0-9]{4}$/;
                }else{
                    return /^[0-9]{3}$/;
                }
            },
            preparePayment:function() {
                var self = this;
                if (this.threeDSEnabled()) {
                    this.redirectAfterPlaceOrder = false;
                }
                this.isSavedCardPayment=false;
                this.paymentToken = null;
                 var $form = $('#' + this.getCode() + '-form');
                 var $savedCardForm = $('#' + this.getCode() + '-savedcard-form');
                 var selectedSavedCardToken = $("input[name='payment[token_to_use]']:checked").val();

                 var cc_type_selected = this.getselectedCCType('payment[cc_type]');

                 if(cc_type_selected == 'savedcard'){
                      //Saved card handle
                      if((this.intigrationmode == 'direct' && $savedCardForm.validation() && $savedCardForm.validation('isValid') && selectedSavedCardToken) ||
                        (this.intigrationmode == 'redirect' && $form.validation() && $form.validation('isValid') && selectedSavedCardToken)){
                            var cardType = $("input[name='payment[token_to_use]']:checked").next().val();
                            this.isSavedCardPayment=true;
                            this.paymentToken = selectedSavedCardToken;
                            var savedcvv = $('.saved-cvv-number').val();
                            var res = this.getRegexCode(cardType).exec(savedcvv);
                            if(savedcvv != res){
                                $('#saved-cvv-error').css('display', 'block');
                                $('#saved-cvv-error').html('Please, enter valid Card Verification Number');
                            }else{
                                this.redirectAfterPlaceOrder = false;
                                self.placeOrder();
                            }
                      }
                 }else if($form.validation() && $form.validation('isValid')){
                        //Direct form handle
                        this.saveMyCard = $('#' + this.getCode() + '_save_card').is(":checked");
                        if (this.isClientSideEncryptionEnabled() && this.intigrationmode == 'direct') {
                            Worldpay.setPublicKey(this.getCsePublicKey());
                            var cseData = {
                                cvc: this.creditCardVerificationNumber(),
                                cardHolderName: $('#' + this.getCode() + '_cc_name').val(),
                                cardNumber: this.creditCardNumber(),
                                expiryMonth: this.creditCardExpMonth(),
                                expiryYear: this.creditCardExpYear()
                            };
                            var encryptedData = Worldpay.encrypt(cseData);
                            this.cseData = encryptedData;
                    }
                    self.placeOrder();
                }else {
                    return $form.validation() && $form.validation('isValid');
                }
            },
            afterPlaceOrder: function (data, event) {
                if (this.isSavedCardPayment) {
                    window.location.replace(url.build('worldpay/savedcard/redirect'));
                }else if(this.intigrationmode == 'redirect' && !this.isSavedCardPayment){
                    window.location.replace(url.build('worldpay/redirectresult/redirect'));
                }else if(this.intigrationmode == 'direct' && this.threeDSEnabled() && !this.isSavedCardPayment){
                    window.location.replace(url.build('worldpay/threedsecure/auth'));
                }
            }
        });
    }
);