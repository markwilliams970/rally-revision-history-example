Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    layout: { type: 'hbox' },
    defaults: { padding: 10 },

    items: [
        {xtype: 'container',itemId:'render_example', flex: 1},
        {xtype: 'container',itemId:'line_by_line_example', flex: 1}
    ],

    _storiesWithRevisionHistory: [],
    _storiesWithRevisions: [],

    launch: function() {
        this._getSomeStories();
    },

    _getSomeStories: function() {
        if ( this.render_grid ) { this.render_grid.destroy(); }
        if ( this.line_grid ) { this.line_grid.destroy(); }
        Ext.create('Rally.data.WsapiDataStore',{
            autoLoad: true,
            model: 'User Story',
            limit: 20,
            fetch: ['FormattedID','Name','CreationDate','User','RevisionHistory','Revisions'],
            listeners: {
                load: this._onStoriesLoaded,
                scope: this
            }
        });
    },


    _onStoriesLoaded: function(store, records, success) {

        var me = this;

        me._storiesWithRevisionHistory = [];
        me._storiesWithRevisions = [];

        var historyPromises = [];
        var revisionPromises = [];

        if (records.length === 0) {
            me._noArtifactsNotify();
        } else {

            Ext.Array.each(records, function(artifact) {
                historyPromises.push(me._getRevisionHistory(artifact, me));
            });

            Deft.Promise.all(historyPromises).then({
                success: function(results) {
                    Ext.Array.each(results, function(result) {
                        me._storiesWithRevisionHistory.push(result);
                    });

                    Ext.Array.each(me._storiesWithRevisionHistory, function(story) {
                        revisionPromises.push(me._getRevisions(story, me));
                    });

                    Deft.Promise.all(revisionPromises).then({
                        success: function(results) {
                            Ext.Array.each(results, function(result) {
                                me._storiesWithRevisions.push(result);
                            });

                            me._showRenderedGrid();
                            me._prepareLineByLineGrid();
                        }
                    });
                }
            });
        }
    },

    _getRevisionHistory: function(artifact, scope) {
        var deferred = Ext.create('Deft.Deferred');
        var me = scope;

        var artifactRef = artifact.get('_ref');
        var artifactObjectID = artifact.get('ObjectID');
        var artifactFormattedID = artifact.get('FormattedID');
        var artifactName = artifact.get('Name');

        var revisionModel = Rally.data.ModelFactory.getModel({
            type: 'RevisionHistory',
            scope: this,
            success: function(model, operation) {
                model.load(Rally.util.Ref.getOidFromRef(artifact.get('RevisionHistory')._ref), {
                    scope: this,
                    success: function(record, operation) {
                        result = {
                            "_ref": artifactRef,
                            "ObjectID": artifactObjectID,
                            "FormattedID": artifactFormattedID,
                            "Name": artifactName,
                            "RevisionHistory": record
                        };
                        deferred.resolve(result);
                    }
                });
            }
        });
        return deferred;
    },

    _getRevisions: function(artifact, scope) {

        var deferred = Ext.create('Deft.Deferred');
        var me = scope;

        var revisions = [];
        var resultHash = {};

        var revisionHistoryObject = artifact.RevisionHistory;
        var artifactRevisions = revisionHistoryObject.getCollection("Revisions", {fetch: ['RevisionNumber', 'CreationDate', 'User']});

        artifactRevisions.load({
            callback: function(records, operation, success) {
                Ext.Array.each(records, function(revision) {
                    revisions.push(revision);
                });
                result = {
                    "_ref": artifact._ref,
                    "ObjectID": artifact.ObjectID,
                    "FormattedID": artifact.FormattedID,
                    "Name": artifact.Name,
                    "RevisionHistory": revisionHistoryObject,
                    "Revisions": revisions
                };
                deferred.resolve(result);
            }
        });

        return deferred;
    },

    /* formats data for the revision history cell */
    _revisionRenderer: function(revisions) {
        var formatted_value_array = [];
        Ext.Array.each(revisions, function(revision) {
            var revNumber = revision.get('RevisionNumber');
            var revCreationDate = Rally.util.DateTime.toIsoString(new Date(revision.get('CreationDate')), false);
            var revUser = revision.get('User')._refObjectName;
            formatted_value_array.push(revNumber + " on " + revCreationDate + " by " + revUser);
        });
        return formatted_value_array.join("<br/>");
    },

    _showRenderedGrid: function() {
        var me = this;

        if ( this.render_grid ) {
            this.render_grid.destroy();
        }

        var gridStore = Ext.create('Rally.data.custom.Store', {
            data: me._storiesWithRevisions,
            pageSize: 20,
            remoteSort: false
        });

        this.render_grid = Ext.create('Rally.ui.grid.Grid',{
            store: gridStore,
            columnCfgs: [
                { text: 'ID', dataIndex: 'FormattedID' },
                { text: 'Name', dataIndex: 'Name' },
                { text: 'Revisions', dataIndex: 'Revisions', renderer: this._revisionRenderer, flex: 1}
            ]
        });

        this.down('#render_example').add(this.render_grid);
    },

    _prepareLineByLineGrid: function() {
        var me = this;
        var lines = [];

        Ext.Array.each(me._storiesWithRevisions, function(item) {
            var itemRevs = item.Revisions;
            Ext.Array.each(itemRevs, function(rev) {
                var line = {
                    FormattedID: item.FormattedID,
                    Name: item.Name,
                    RevisionNumber: rev.get('RevisionNumber'),
                    RevisionDate: Rally.util.DateTime.toIsoString(new Date(rev.get('CreationDate')), false),
                    RevisionAuthor: rev.get('User')._refObjectName
                };
                lines.push(line);
            });
        });

        /* could be much more compact, but I like to separate the data gathering from the data display */
        Ext.create('Rally.data.custom.Store',{
            autoLoad: true,
            data: lines,
            listeners: {
                load: function(store, data, success) {
                    this._showLineByLineGrid(store);
                },
                scope: this
            }
        });
    },

    _showLineByLineGrid: function(store) {
        if ( this.line_grid ) { this.line_grid.destroy(); }
        this.line_grid = Ext.create('Rally.ui.grid.Grid',{
            store: store,
            columnCfgs: [
                { text: 'ID', dataIndex: 'FormattedID' },
                { text: 'Name', dataIndex: 'Name' },
                { text: 'id', dataIndex: 'RevisionNumber'},
                { text: 'date', dataIndex: 'RevisionDate', flex: 1 },
                { text: 'author', dataIndex: 'RevisionAuthor' }
            ]
        });
        this.down('#line_by_line_example').add(this.line_grid);
    }
});
