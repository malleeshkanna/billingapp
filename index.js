const express = require('express');
const fs = require('fs');
const cors=require('cors');
const app=express();
const url="https://intriguebillingsoft-default-rtdb.firebaseio.com/billdetails.json";

app.use(express.json());

app.use(function (req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:8000');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
  res.setHeader('Access-Control-Allow-Credentials', true);
  next();
  });

app.use(cors());

app.post('/save_bill',function(req,res){
  fs.readFile('bills.json','utf-8',(err,data)=>{
    const info=JSON.parse(data);
    info.push(req.body);
    fs.writeFile('bills.json',JSON.stringify(info),(data)=>{
      res.json({"status":true,"message":"Bill have been saved Successfully"})
    })
  })
  
})

app.get('/print_bill',function(req,res){
  fs.readFile('bills.json','utf-8',(err,data)=>{
    const printdata=JSON.parse(data);
    var billresp={
      status:true,
      message:"Bill Fetched Successfully",
      data:printdata[printdata.length-1]
    }
    res.json(billresp);
  })
})

app.get('/biller_name',function(req,res){
  const names=["MalleeshKanna","Kalamani"];
  res.send(names);
})

app.get('/bill_list',function(req,res){
  fs.readFile('bills.json','utf-8',(err,data)=>{
    res.send(JSON.parse(data))
  })
})

app.listen(3000,()=>{
  console.log('port listening at 3000');
})