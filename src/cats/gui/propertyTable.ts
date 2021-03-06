// Copyright (c) JBaron.  All rights reserved.
// 
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//

module Cats.Gui {

    /**
     * This table displays properties
     */
    export class PropertyTable extends qx.ui.table.Table {

        private data: Array<any>;
        private editor:Editor;

        constructor(headers = ["Name", "Value"]) {
            var tableModel = new qx.ui.table.model.Simple();
            tableModel.setColumns(headers);
            tableModel.setData([]);
            this.setStatusBarVisible(false); 

            var custom: any = {
                tableColumnModel: function(obj) {
                    return new qx.ui.table.columnmodel.Resize(obj);
                }
            };
            super(tableModel, custom);
            this.setDecorator(null);
            this.setPadding(0, 0, 0, 0);
            
 
            IDE.editorTabView.onChangeEditor(this.register.bind(this));
            
        }

        clear() {
            this.setData([]);
        }

        private register(editor:Editor) {
            if (this.editor) {
                this.editor.off("properties", this.setData, this);
            }
            this.editor = editor;
            
            if (editor) {
                editor.on("properties", this.setData,this);
                this.setData(editor.properties);
            } else {
                this.clear();
            }
        }

        getData(){
            return this.data;
        }

        setData(data:any[]) {
            this.data = data;
            var rows: any[] = [];
            if (data) {
                data.forEach((row) => {
                    rows.push([row.key, row.value]);
                });
            }
            this.getTableModel().setData(rows);
            this.getSelectionModel().resetSelection();
        }


    }
}
