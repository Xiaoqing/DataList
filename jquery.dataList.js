(function ($, undefined) {

    ///<summary>
    /// Make the ajax call to get data based on the provided parameters.
    ///</summary>
    /// <param name="url">The server url for the data.</param>
    /// <param name="postData">The post data for the server call.</param>
    /// <param name="dataType">The data type to return.</param>
    /// <param name="type">The tye of the call.</param>
    /// <param name="cache">Whether to call should be cached by the browser or not.</param>
    /// <param name="onSuccess">The success callback.</param>
    /// <param name="onError">The failure callback.</param>
    function makeAjaxCall(url, postData, dataType, type, cache, onSuccess, onError) {
        var request = $.ajax({
            "url": url,
            "data": postData,
            "dataType": dataType,
            "cache": cache,
            "type": type
        });

        // callback handler that will be called on success
        request.done(function (json, textStatus, jqXHR) {
            if (json.error) {
                log(dataList.Settings, 0, json.error);
            }

            onSuccess(json);
        });

        // callback handler that will be called on failure
        request.fail(function (jqXHR, textStatus, errorThrown) {
            if (errorThrown == "parsererror") {
                log(dataList.Settings, 0, "DataTables warning: JSON data from " +
                    "server could not be parsed. This is caused by a JSON formatting error.");
            }

            onError(errorThrown);
        });
    };

    ///<summary>
    /// Render the template using jsrener and return the rendered result.
    ///</summary>
    /// <param name="templates">The templates defined in the template file.Multipe templates can be defined in the template file.</param>
    /// <param name="templateId">The id of the template to be used.</param>
    /// <param name="data">The data used to render the template.</param>
    function selectTemplate(templateId) {
        var selectedTemplate = $(alltemplates).filter("script#" + templateId);
        return selectedTemplate;
    };

    ///<summary>
    /// Fetch the model data
    ///</summary>
    /// <param name="model">The model.</param>
    function fetchModelData(model) {
        var request = model.fetch();

        request.done(function (json, textStatus, xhr) {
            if (json.error) {
                log(dataList.Settings, 0, json.error);
            }

            // if request success, then split the data to each sub model
            model.setModelData();
        });

        request.fail(function (xhr, textStatus, errorThrown) {
            if (errorThrown == "parsererror") {
                log(dataList.Settings, 0, "DataTables warning: JSON data from " +
                    "server could not be parsed. This is caused by a JSON formatting error.");
            }

        });
    };

    ///<summary>
    /// Display the error to the user or log to the console.
    ///</summary>
    /// <param name="message">The error message.</param>
    /// <param name="level">The level.</param>
    /// <param name="errorMode">The error mode.</param>
    function log(message, level, errorMode) {
        var alertMessage = (settings === null) ?
			"dataList warning: " + message :
			"dataList warning (list id = '" + settings.listId + "'): " + message;

        if (level === 0) {
            if (errorMode == 'alert') {
                alert(alertMessage);
            }
            else {
                throw new Error(alertMessage);
            }
            return;
        }
        else if (window.console && console.log) {
            console.log(alertMessage);
        }
    };

    var alltemplates = null;

    ///<summary>
    /// The container model for the list.
    ///</summary>
    var DataListModel = Backbone.Model.extend({

        models: {},

        getAjaxUrl: function () {
            var originalOptions = this.get("options");
            var optionsCopy = $.extend(false, {}, originalOptions);
            var serverUrl = optionsCopy.serverUrl;
            var optionsShouldNotBeInUrl = ["templateUrl", "serverUrl", "disabled", "bindings", "bindingObjects", "events", "templateId"];
            optionsShouldNotBeInUrl.forEach(function (option) {
                delete optionsCopy[option];
            });
            return serverUrl + "?" + decodeURIComponent($.param(optionsCopy));
        },

        url: function () {
            return this.getAjaxUrl();
        },

        initialize: function () {
            var self = this;
            $.each(this.get("options").bindingObjects, (function (index, binding) {
                var model = Backbone.Model.extend({
                    // we don't need the sub model to retrieve data from server as 
                    // all the data for this model is passed in from parent model
                });
                var modelId = "datalist_" + binding.template + "_model";
                self.models[modelId] = new model();
                $.extend(true, self.models[modelId], { data_attr: binding.data || binding.data_collection });
            }));
        },

        setModelData: function () {
            var self = this;
            $.each(self.models, (function (index, model) {
                if (model.data_attr != undefined && model.data_attr != null && model.data_attr != "") {
                    model.set(self.attributes[model.data_attr]);
                }
            }));
        }
    });

    ///<summary>
    /// The container view for the list.
    ///</summary>
    var DataListView = Backbone.View.extend({

        views: {},

        events: {},

        initialize: function () {
            var self = this;

            // Set up the child views
            $.each(self.model.get("options").bindingObjects, (function (index, binding) {
                var view = Backbone.View.extend({
                    renderedTemplate: {},

                    initialize: function () {
                        _.bindAll(this, 'render', 'close');
                        this.model.bind('change', this.render);
                        this.model.view = this;
                    },

                    render: function (alreadyRendered) {
                        if (alreadyRendered !== true) {
                            this.renderedTemplate = selectTemplate(binding.template).render(this.model.attributes);
                        };
                        $(this.binding.element).empty().html(this.renderedTemplate);

                        // We also need to render all the child views using the already rendered content
                        $.each(this.binding.children, function (index, child) {
                            var childViewId = "datalist_" + child.template + "_view";
                            self.views[childViewId].render(true);
                        });

                        return this;
                    },

                    // Remove this view from the DOM.
                    remove: function () {
                        this.$(this.binding.element).remove();
                    },

                    // Remove the item, destroy the model.
                    close: function () {
                        this.model.clear();
                    }
                });
                var viewId = "datalist_" + binding.template + "_view";
                self.views[viewId] = new view({ model: self.model.models["datalist_" + binding.template + "_model"] });
                $.extend(self.views[viewId], {
                    renderedTemplate: selectTemplate(binding.template).html(), 
                    binding: binding
                });
            }));

            // Set up the events and their handlers.
            $.each(self.model.get("options").events, (function (key, value) {
                var funcId = _.uniqueId("datalist_");
                self.events[key] = funcId;
                self[funcId] = function (event) {
                    var returnValue = value(event);
                    if (returnValue != undefined && returnValue != null) {
                        this.model.options[event.target.id] = returnValue;
                        fetchModelData(this.model);
                    }
                };
            }));
        },

        ///<summary>
        /// Remove this view from the DOM.
        ///</summary>
        remove: function () {
            $(this.el).remove();
        },

        // Remove the item, destroy the model.
        close: function () {
            this.model.clear();
        }
    });

    $.widget("xyz.dataList", {

        options: {
            // The number of items displayed per page
            itemsPerPage: 10,

            // The view model
            currentPageNumber: 1,

            // The bindings of data to element in templates or in document body
            bindings: {
                "div#container": "{binding template=datalist_products}",
                "select#datalist_sort_by": "{binding template=datalist_sort_by; parent_template=datalist_products; data=sortbys}",
                "div#datalist_filters": "{binding template=datalist_filters; parent_template=datalist_products; data_collection=filters}",
                "div#datalist_items": "{binding template=datalist_items; parent_template=datalist_products; data_collection=products}",
                "div#datalist_pages": "{binding template=datalist_pages; parent_template=datalist_products; data=pages}"
            },

            // The events to listen to and the function to return the event data.
            // The event data will be passed to the server as url parameters.
            events: {
                "keypress input#datalist_search": function (event) {
                    if (event.keyCode != 13) {
                        return undefined;
                    }
                    return $(event.target).val();
                },
                "click .datalist_filters": function (event) {
                    return event.target.checked;
                },
                "click .datalist_pages": function (event) {
                    return $(event.target).val();
                },
                "change select#datalist_sort_by": function (event) {
                    return event.target.checked;
                }
            }
        },

        _create: function () {
            var self = this;

            if (alltemplates == undefined || alltemplates == null) {
                this._getListTemplate(
                    self.options.templateUrl,
                    null,
                    function (templates) {
                        alltemplates = templates;
                        self._initializeBindings(self.options, templates, self.element.parent());
                    },
                    function (error) {
                        log(error);
                    }
                );
            }
            else {
                self._initializeBindings(self.options, templates, self.element.parent());
            }
        },

        _init: function () {

        },

        _setOption: function (key, value) {
            switch (key) {
                case "itemsPerPage":
                    // redraw the list
                    break;
            }

            // and call the parent function too!
            return this._super(key, value);
        },

        _destroy: function () {
            return this._super();
        },

        ///<summary>
        /// Sanity check to make sure:
        /// 1. We are on a list
        /// 2. The list have a id
        ///</summary>
        _sanityCheck: function (list) {
            // Sanity check 
            if (list.nodeName.toLowerCase() != 'ul' && list.nodeName.toLowerCase() != 'ol') {
                log(null, 0, "Attempted to initialise dataList on a node which is not a " +
                    "list: " + list.nodeName);
                return;
            }

            if (list.id == 'undefined' || list.id == null) {
                log(null, 0, "The list must have a unique id in order for dataList to work.");
                return;
            }
        },

        ///<summary>
        /// Get the list template from the server.
        ///</summary>
        /// <param name="url">The server url for the data.</param>
        /// <param name="postData">The post data for the server call.</param>
        /// <param name="onSuccess">The success callback.</param>
        /// <param name="onError">The failure callback.</param>
        _getListTemplate: function (url, postData, onSuccess, onError) {
            makeAjaxCall(url, postData, "html", "GET", true, onSuccess, onError);
        },

        ///<summary>
        /// Intialize the main model and view.
        ///</summary>
        /// <param name="options">The server url for the data.</param>
        /// <param name="templates">The post data for the server call.</param>
        /// <param name="element">The success callback.</param>
        _initializeBindings: function (options, templates, element) {
            options.bindingObjects = this._parseBindings(options.bindings);
            this._initializeMainModelAndView(options, templates, element);
        },

        ///<summary>
        /// Intialize the main model and view.
        ///</summary>
        /// <param name="options">The server url for the data.</param>
        /// <param name="templates">The post data for the server call.</param>
        /// <param name="element">The success callback.</param>
        _initializeMainModelAndView: function (options, templates, element) {
            var self = this;

            // Initialize the main model
            var datalistModel = new DataListModel({ options: options });
            $.extend(true, datalistModel, {
                urlRoot: options.serverUrl
            });

            // Initialize the main view
            var datalistView = new DataListView({
                model: datalistModel,
                el: element
            });
            $.extend(true, datalistView, {
                templates: templates
            });

            self._renderRawBindings(options.bindingObjects, datalistView);

            // Start retrieving data
            fetchModelData(datalistModel);
        },

        ///<summary>
        /// Render the templates as it is (without populating the data in the template) and then each responsible view
        /// will render the relevant part of the view with data.
        ///
        /// When rendering the raw templates, we need to make sure that the parent templates get rendered before any of
        /// the child templates.
        ///</summary>
        /// <param name="bindings">The bindings in the options.</param>
        _renderRawBindings: function (bindingObjects, view) {
            var self = this;
            $.each(bindingObjects, function (index, binding) {
                // We only need to render the parent-most template 
                // because the parent template will automatically render its child templates
                if (binding.parent == undefined || binding.parent == null) {
                    var viewId = "datalist_" + binding.template + "_view";
                    view.views[viewId].render(true);
                }
            });
        },

        ///<summary>
        /// Parse all of the binding string into an array of binding object.
        ///</summary>
        /// <param name="bindingString">The binding string, e.g. template=datalist_products.</param>
        _parseBindings: function (bindings) {
            var self = this;
            var bindingArray = [];
            $.each(bindings, (function (key, value) {
                var binding = self._parseABindingString(value);
                if ($.isEmptyObject(binding)) {
                    throw new Error(value + " can't be parsed into an object.");
                }
                binding.element = key;
                bindingArray.push(binding);
            }));

            var clonedArray = bindingArray.slice(0);
            $.each(bindingArray, (function (key, value) {
                value.parent = self._findBindingByTemplate(clonedArray, value.parent_template);
                value.children = self._findBindingsByTemplate(clonedArray, value.template);
            }));

            return bindingArray;
        },

        ///<summary>
        /// Find a binding by the template.
        ///</summary>
        /// <param name="bindings">The bindings array.</param>
        /// <param name="template">The template id.</param>
        _findBindingByTemplate: function (bindings, template) {
            var returnValue;
            $.each(bindings, function (index, binding) {
                if (binding.template == template) {
                    returnValue = binding;
                    return false;
                };
            });

            return returnValue;
        },

        ///<summary>
        /// Find all child bindings of the template.
        ///</summary>
        /// <param name="bindings">The bindings array.</param>
        /// <param name="template">The parent template id.</param>
        _findBindingsByTemplate: function (bindings, template) {
            var bindingArray = [];
            $.each(bindings, function (key, value) {
                if (value.parent_template == template) {
                    bindingArray.push(value);
                }
            });

            return bindingArray;
        },

        ///<summary>
        /// Parse a binding string into a binding object.
        ///</summary>
        /// <param name="bindingString">The binding string, e.g. template=datalist_products.</param>
        _parseABindingString: function (bindingString) {
            var binding = {};
            bindingString = bindingString.replace("{", "");
            bindingString = bindingString.replace("binding", "");
            bindingString = bindingString.replace("}", "");
            bindingString = $.trim(bindingString);
            var bindingKeyValuePairs = bindingString.split(";");
            $.each(bindingKeyValuePairs, function (key, value) {
                var keyAndValue = value.split("=");
                if (keyAndValue.length != 2) {
                    throw new Error(value + " needs to be separated by =");
                }
                binding[$.trim(keyAndValue[0])] = $.trim(keyAndValue[1]);
            });

            return binding;
        }
    });
})(jQuery);

